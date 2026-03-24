import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ILanguageHandler, ICompileCommand, ICompileResult, IRunCommand, IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
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

    private static readonly dependencyTarget = '__mirai_dep__';

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

    getCompileCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): ICompileCommand {
        return {
            command: this.getCompilerPath(preset),
            args: this.getCompileArgs(srcFile, preset, basePath, outputPath)
        };
    }

    getCompileCommandString(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string {
        const compileCommand = this.getCompileCommand(srcFile, preset, basePath, outputPath);
        return `${compileCommand.command} ${compileCommand.args.join(' ')}`;
    }

    protected async getDependencyFilesFromCompiler(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        args: string[]
    ): Promise<string[] | undefined> {
        return new Promise(resolve => {
            const compilerPath = this.getCompilerPath(preset);
            const cwd = basePath || path.dirname(srcFile);
            const depArgs = [...args, '-MM', '-MT', BaseCompiledHandler.dependencyTarget, srcFile];
            const child = spawn(compilerPath, depArgs, { windowsHide: true, cwd });

            let stdout = '';

            child.stdout.on('data', data => { stdout += data.toString(); });
            child.on('exit', code => {
                if (code !== 0) {
                    resolve(undefined);
                    return;
                }
                resolve(this.parseDependencyOutput(stdout, srcFile, cwd));
            });
            child.on('error', () => { resolve(undefined); });
        });
    }

    private parseDependencyOutput(output: string, srcFile: string, cwd: string): string[] | undefined {
        const normalizedOutput = output
            .replace(/\r\n/g, '\n')
            .replace(/\\\n/g, ' ')
            .trim();
        const prefix = `${BaseCompiledHandler.dependencyTarget}:`;
        if (!normalizedOutput.startsWith(prefix)) {
            return undefined;
        }

        const dependencyText = normalizedOutput.slice(prefix.length).trim();
        const dependencies = this.tokenizeDependencyOutput(dependencyText)
            .map(dep => this.resolveDependencyPath(dep, cwd))
            .filter(dep => dep.length > 0);

        dependencies.push(path.normalize(srcFile));
        return Array.from(new Set(dependencies));
    }

    private tokenizeDependencyOutput(dependencyText: string): string[] {
        const dependencies: string[] = [];
        let current = '';

        for (let i = 0; i < dependencyText.length; i++) {
            const ch = dependencyText[i];

            if (/\s/.test(ch)) {
                if (current) {
                    dependencies.push(current);
                    current = '';
                }
                continue;
            }

            if (ch === '$' && dependencyText[i + 1] === '$') {
                current += '$';
                i++;
                continue;
            }

            if (ch === '\\') {
                const next = dependencyText[i + 1];
                if (next && (/\s/.test(next) || next === '#' || next === '\\')) {
                    current += next;
                    i++;
                    continue;
                }
            }

            current += ch;
        }

        if (current) {
            dependencies.push(current);
        }

        return dependencies;
    }

    private resolveDependencyPath(dependency: string, cwd: string): string {
        const resolvedPath = path.isAbsolute(dependency)
            ? dependency
            : path.resolve(cwd, dependency);
        return path.normalize(resolvedPath);
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
