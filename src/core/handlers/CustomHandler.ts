import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ILanguageHandler, ICompileResult, IRunCommand, IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';

/**
 * 自定义语言配置接口
 */
export interface ICustomLanguageConfig {
    /** 语言标识符（唯一） */
    languageId: string;
    /** 显示名称 */
    displayName: string;
    /** 支持的文件扩展名 */
    fileExtensions: string[];

    /**
     * 编译配置（可选，解释型语言不需要）
     */
    compile?: {
        /** 编译命令 */
        command: string;
        /** 编译参数，支持变量替换 */
        args: string[];
        /** 输出文件扩展名 */
        outputExtension?: string;
    };

    /**
     * 运行配置
     */
    run: {
        /** 运行命令 */
        command: string;
        /** 运行参数，支持变量替换 */
        args: string[];
        /** 工作目录（可选） */
        cwd?: string;
    };

    /**
     * 调试配置（可选）
     */
    debug?: {
        /** 调试器类型 */
        type: string;
        /** 所需扩展 ID */
        extensionId: string;
        /** 额外调试配置 */
        config?: Record<string, unknown>;
    };
}

/**
 * 变量上下文
 */
interface IVariableContext {
    srcFile: string;
    srcDir: string;
    srcName: string;
    srcExt: string;
    outputFile: string;
    outputDir: string;
    basePath: string;
    outputPath: string;
    workspaceFolder: string;
}

/**
 * 自定义语言处理器
 * 
 * 通过配置驱动的方式支持任意语言
 */
export class CustomHandler implements ILanguageHandler {
    readonly languageId: string;
    readonly displayName: string;
    readonly fileExtensions: string[];

    constructor(private config: ICustomLanguageConfig) {
        this.languageId = config.languageId;
        this.displayName = config.displayName;
        this.fileExtensions = config.fileExtensions;
    }

    needsCompilation(): boolean {
        return !!this.config.compile;
    }

    async compile(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<ICompileResult> {
        if (!this.config.compile) {
            return { success: true, message: '无需编译', output: '' };
        }

        const context = this.createVariableContext(srcFile, basePath, outputPath);
        const command = this.replaceVariables(this.config.compile.command, context);
        const args = this.config.compile.args.map(arg => this.replaceVariables(arg, context));

        // 确保输出目录存在
        const outputFile = this.getOutputFile(srcFile, basePath, outputPath);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });

        return new Promise(resolve => {
            const child = spawn(command, args, { 
                windowsHide: true,
                shell: true  // 允许使用 shell 特性
            });

            let output = '';

            child.stdout.on('data', data => { output += data.toString(); });
            child.stderr.on('data', data => { output += data.toString(); });

            child.on('exit', code => {
                if (code === 0) {
                    resolve({ success: true, message: '编译成功', output });
                } else {
                    resolve({ success: false, message: '编译失败', output });
                }
            });

            child.on('error', error => {
                resolve({ success: false, message: `错误: ${error.message}`, output });
            });

            token.onCancellationRequested(() => {
                child.kill();
                resolve({ success: false, message: '已取消', output: '' });
            });
        });
    }

    getOutputFile(srcFile: string, basePath: string, outputPath: string): string {
        const ext = path.extname(srcFile);
        const relativePath = path.relative(basePath, srcFile);
        
        let outputExt: string;
        if (this.config.compile?.outputExtension) {
            outputExt = this.config.compile.outputExtension;
        } else if (this.needsCompilation()) {
            outputExt = process.platform === 'win32' ? '.exe' : '';
        } else {
            // 解释型语言返回源文件
            return srcFile;
        }

        return path.join(
            outputPath,
            path.dirname(relativePath),
            path.basename(relativePath, ext) + outputExt
        );
    }

    getRunCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IRunCommand {
        const context = this.createVariableContext(srcFile, basePath, outputPath);
        const command = this.replaceVariables(this.config.run.command, context);
        const args = this.config.run.args.map(arg => this.replaceVariables(arg, context));
        const cwd = this.config.run.cwd 
            ? this.replaceVariables(this.config.run.cwd, context)
            : undefined;

        return { command, args, cwd };
    }

    getCompileCommandString(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string {
        if (!this.config.compile) {
            return `${this.languageId}:${preset.label}`;
        }

        const context = this.createVariableContext(srcFile, basePath, outputPath);
        const command = this.replaceVariables(this.config.compile.command, context);
        const args = this.config.compile.args.map(arg => this.replaceVariables(arg, context));
        return `${command} ${args.join(' ')}`;
    }

    validatePreset(preset: LanguagePreset): string | null {
        // 自定义处理器的验证较为宽松
        return null;
    }

    getSupportedDebuggers(): IDebuggerInfo[] {
        if (!this.config.debug) {
            return [];
        }
        return [{
            type: this.config.debug.type,
            extensionId: this.config.debug.extensionId,
            displayName: this.displayName
        }];
    }

    getDebugConfig(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined {
        if (!this.config.debug) {
            return undefined;
        }

        // 检查调试器扩展是否安装
        if (!vscode.extensions.getExtension(this.config.debug.extensionId)) {
            return undefined;
        }

        const context = this.createVariableContext(srcFile, basePath, outputPath);
        const outputFile = this.getOutputFile(srcFile, basePath, outputPath);

        return {
            type: this.config.debug.type,
            extensionId: this.config.debug.extensionId,
            request: 'launch',
            name: `Debug ${this.displayName}`,
            program: outputFile,
            args: [],
            cwd: '${workspaceFolder}',
            ...this.config.debug.config
        };
    }

    /**
     * 创建变量上下文
     */
    private createVariableContext(
        srcFile: string,
        basePath: string,
        outputPath: string
    ): IVariableContext {
        const srcDir = path.dirname(srcFile);
        const srcExt = path.extname(srcFile);
        const srcName = path.basename(srcFile, srcExt);
        
        const outputFile = this.getOutputFileInternal(srcFile, basePath, outputPath);
        const outputDir = path.dirname(outputFile);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || basePath;

        return {
            srcFile,
            srcDir,
            srcName,
            srcExt,
            outputFile,
            outputDir,
            basePath,
            outputPath,
            workspaceFolder
        };
    }

    /**
     * 内部方法：获取输出文件路径（避免递归）
     */
    private getOutputFileInternal(srcFile: string, basePath: string, outputPath: string): string {
        const ext = path.extname(srcFile);
        const relativePath = path.relative(basePath, srcFile);
        
        let outputExt: string;
        if (this.config.compile?.outputExtension) {
            outputExt = this.config.compile.outputExtension;
        } else if (this.config.compile) {
            outputExt = process.platform === 'win32' ? '.exe' : '';
        } else {
            return srcFile;
        }

        return path.join(
            outputPath,
            path.dirname(relativePath),
            path.basename(relativePath, ext) + outputExt
        );
    }

    /**
     * 替换变量
     * 
     * 支持的变量：
     * - ${srcFile} - 源文件完整路径
     * - ${srcDir} - 源文件目录
     * - ${srcName} - 源文件名（无扩展名）
     * - ${srcExt} - 源文件扩展名
     * - ${outputFile} - 输出文件路径
     * - ${outputDir} - 输出文件目录
     * - ${basePath} - 源文件基目录
     * - ${outputPath} - 输出基目录
     * - ${workspaceFolder} - 工作区根目录
     */
    private replaceVariables(template: string, context: IVariableContext): string {
        return template
            .replace(/\$\{srcFile\}/g, context.srcFile)
            .replace(/\$\{srcDir\}/g, context.srcDir)
            .replace(/\$\{srcName\}/g, context.srcName)
            .replace(/\$\{srcExt\}/g, context.srcExt)
            .replace(/\$\{outputFile\}/g, context.outputFile)
            .replace(/\$\{outputDir\}/g, context.outputDir)
            .replace(/\$\{basePath\}/g, context.basePath)
            .replace(/\$\{outputPath\}/g, context.outputPath)
            .replace(/\$\{workspaceFolder\}/g, context.workspaceFolder);
    }

    /**
     * 从配置创建 CustomHandler
     */
    static fromConfig(config: ICustomLanguageConfig): CustomHandler {
        return new CustomHandler(config);
    }
}
