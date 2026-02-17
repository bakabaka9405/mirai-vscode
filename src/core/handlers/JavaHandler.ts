import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ILanguageHandler, ICompileResult, IRunCommand, IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';

/**
 * Java 语言处理器
 */
export class JavaHandler implements ILanguageHandler {
    readonly languageId = 'java';
    readonly displayName = 'Java';
    readonly fileExtensions = ['java'];

    needsCompilation(): boolean {
        return true;
    }

    async compile(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<ICompileResult> {
        return new Promise(resolve => {
            const classDir = this.getClassDir(srcFile, basePath, outputPath);
            fs.mkdirSync(classDir, { recursive: true });

            const compilerPath = preset.compilerPath || 'javac';
            const args = this.getCompileArgs(srcFile, preset, classDir);

            const child = spawn(compilerPath, args, { windowsHide: true });

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

    private getCompileArgs(srcFile: string, preset: LanguagePreset, classDir: string): string[] {
        const args: string[] = [];

        // 输出目录
        args.push('-d', classDir);

        // 额外参数
        if (preset.additionalArgs) {
            args.push(...preset.additionalArgs);
        }

        // 源文件
        args.push(srcFile);

        return args;
    }

    /**
     * 获取 .class 文件输出目录
     */
    private getClassDir(srcFile: string, basePath: string, outputPath: string): string {
        const relativePath = path.relative(basePath, srcFile);
        return path.join(outputPath, path.dirname(relativePath));
    }

    getOutputFile(srcFile: string, basePath: string, outputPath: string): string {
        const className = this.extractClassName(srcFile);
        const classDir = this.getClassDir(srcFile, basePath, outputPath);
        return path.join(classDir, className + '.class');
    }

    getRunCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IRunCommand {
        const className = this.extractClassName(srcFile);
        const classDir = this.getClassDir(srcFile, basePath, outputPath);
        const runtimePath = preset.runtimePath || 'java';

        const args = ['-cp', classDir];
        if (preset.runtimeArgs) {
            args.push(...preset.runtimeArgs);
        }
        args.push(className);

        return {
            command: runtimePath,
            args,
            cwd: classDir
        };
    }

    /**
     * 从源文件中提取类名
     * 
     * 优先匹配 public class，否则使用文件名
     */
    private extractClassName(srcFile: string): string {
        try {
            const content = fs.readFileSync(srcFile, 'utf-8');
            
            // 匹配 public class ClassName
            const publicMatch = content.match(/public\s+class\s+(\w+)/);
            if (publicMatch) {
                return publicMatch[1];
            }

            // 匹配任意 class ClassName（取第一个）
            const classMatch = content.match(/class\s+(\w+)/);
            if (classMatch) {
                return classMatch[1];
            }
        } catch {
            // 读取失败，使用文件名
        }

        // 回退：使用文件名（去除扩展名，替换空格为下划线）
        const baseName = path.basename(srcFile, '.java');
        return baseName.replace(/\s+/g, '_');
    }

    getCompileCommandString(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string {
        const compilerPath = preset.compilerPath || 'javac';
        const classDir = this.getClassDir(srcFile, basePath, outputPath);
        const args = this.getCompileArgs(srcFile, preset, classDir);
        return `${compilerPath} ${args.join(' ')}`;
    }

    validatePreset(preset: LanguagePreset): string | null {
        // Java 可以使用系统默认的 javac/java
        return null;
    }

    getSupportedDebuggers(): IDebuggerInfo[] {
        return [
            { type: 'java', extensionId: 'vscjava.vscode-java-debug', displayName: 'Debugger for Java' },
        ];
    }

    getDebugConfig(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined {
        const debuggerType = preset.debuggerType || 'java';
        
        // 检查调试器扩展是否安装
        if (!vscode.extensions.getExtension('vscjava.vscode-java-debug')) {
            return undefined;
        }

        const className = this.extractClassName(srcFile);
        const classDir = this.getClassDir(srcFile, basePath, outputPath);

        return {
            type: debuggerType,
            extensionId: 'vscjava.vscode-java-debug',
            request: 'launch',
            name: 'Debug Java',
            mainClass: className,
            classPaths: [classDir],
            args: preset.runtimeArgs || [],
            cwd: classDir,
        };
    }

    applyDebugMode(preset: LanguagePreset): void {
        // Java 调试不需要特殊编译参数
        // 但可以添加 -g 生成调试信息
        if (!preset.additionalArgs) {
            preset.additionalArgs = [];
        }
        if (!preset.additionalArgs.includes('-g')) {
            preset.additionalArgs.push('-g');
        }
    }
}
