import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ILanguageHandler, ICompileResult, IRunCommand, IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';

/**
 * 编译型语言处理器基类
 * 
 * 提供编译型语言的通用实现
 */
export abstract class BaseCompiledHandler implements ILanguageHandler {
    abstract readonly languageId: string;
    abstract readonly displayName: string;
    abstract readonly fileExtensions: string[];

    needsCompilation(): boolean {
        return true;
    }

    /**
     * 获取输出文件扩展名
     */
    protected getOutputExtension(): string {
        return process.platform === 'win32' ? '.exe' : '';
    }

    /**
     * 获取编译参数
     */
    protected abstract getCompileArgs(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string[];

    /**
     * 获取编译器路径
     */
    protected abstract getCompilerPath(preset: LanguagePreset): string;

    getOutputFile(srcFile: string, basePath: string, outputPath: string): string {
        const ext = path.extname(srcFile);
        const relativePath = path.relative(basePath, srcFile);
        return path.join(
            outputPath,
            path.dirname(relativePath),
            path.basename(relativePath, ext) + this.getOutputExtension()
        ).normalize();
    }

    async compile(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<ICompileResult> {
        return new Promise(resolve => {
            const outputFile = this.getOutputFile(srcFile, basePath, outputPath);
            fs.mkdirSync(path.dirname(outputFile), { recursive: true });

            const compilerPath = this.getCompilerPath(preset);
            const args = this.getCompileArgs(srcFile, preset, basePath, outputPath);

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

    getRunCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IRunCommand {
        const outputFile = this.getOutputFile(srcFile, basePath, outputPath);
        return {
            command: outputFile,
            args: []
        };
    }

    getCompileCommandString(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string {
        const compilerPath = this.getCompilerPath(preset);
        const args = this.getCompileArgs(srcFile, preset, basePath, outputPath);
        return `${compilerPath} ${args.join(' ')}`;
    }

    abstract validatePreset(preset: LanguagePreset): string | null;
    abstract getSupportedDebuggers(): IDebuggerInfo[];
    abstract getDebugConfig(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined;
    abstract applyDebugMode(preset: LanguagePreset): void;
}
