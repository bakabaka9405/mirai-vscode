import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { TestPreset, TestCase, TestStatus, ITestResult } from '../core/models';
import { ConfigService } from './ConfigService';

/**
 * 编译服务 - 处理 C++ 代码编译
 */
export class CompilerService {
    private static instance: CompilerService;
    private fileHashCache = new Map<string, string>();
    private outputChannel: vscode.OutputChannel;
    private config: ConfigService;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Mirai-vscode：编译输出');
        this.config = ConfigService.getInstance();
        this.config.onDidChange(() => this.clearCache());
    }

    static getInstance(): CompilerService {
        if (!CompilerService.instance) {
            CompilerService.instance = new CompilerService();
        }
        return CompilerService.instance;
    }

    clearCache(): void {
        this.fileHashCache.clear();
    }

    async compile(
        preset: TestPreset,
        srcFile: string,
        force: boolean = false
    ): Promise<{ success: boolean; message: string; output: string }> {
        const basePath = this.config.srcBasePath;
        const outputPath = this.config.buildBasePath;

        const command = preset.generateCompileCommand(srcFile, basePath, outputPath);
        const hash = this.getFileHash(srcFile) + command;

        if (!force && this.fileHashCache.get(srcFile) === hash) {
            return { success: true, message: 'No change', output: '' };
        }

        if (!fs.existsSync(preset.compilerPath) && !await this.isProgramInPath(preset.compilerPath)) {
            return {
                success: false,
                message: `找不到编译器 ${preset.label}。期望路径：${preset.compilerPath}`,
                output: ''
            };
        }

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在编译...',
            cancellable: true
        }, async (progress, token) => {
            return this.doCompile(preset, srcFile, basePath, outputPath, token);
        });

        this.outputChannel.clear();
        this.outputChannel.appendLine(result.output);

        if (result.success) {
            this.fileHashCache.set(srcFile, hash);
        }

        return result;
    }

    private async doCompile(
        preset: TestPreset,
        srcFile: string,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<{ success: boolean; message: string; output: string }> {
        return new Promise(resolve => {
            const execPath = preset.getExecutableFile(srcFile, basePath, outputPath);
            fs.mkdirSync(path.dirname(execPath), { recursive: true });

            const child = spawn(
                preset.compilerPath,
                preset.generateCompileArgs(srcFile, basePath, outputPath),
                { windowsHide: true }
            );

            let output = '';

            child.stdout.on('data', data => { output += data.toString(); });
            child.stderr.on('data', data => { output += data.toString(); });

            child.on('exit', code => {
                if (code === 0) {
                    resolve({ success: true, message: 'Compilation successful', output });
                } else {
                    resolve({ success: false, message: 'Compilation failed', output });
                }
            });

            child.on('error', error => {
                resolve({ success: false, message: `Error: ${error.message}`, output });
            });

            token.onCancellationRequested(() => {
                child.kill();
                resolve({ success: false, message: 'Cancelled', output: '' });
            });
        });
    }

    showOutput(): void {
        this.outputChannel.show();
    }

    private getFileHash(file: string): string {
        const hash = crypto.createHash('md5');
        const content = fs.readFileSync(file);
        hash.update(content);
        return hash.digest('hex');
    }

    private async isProgramInPath(program: string): Promise<boolean> {
        return new Promise(resolve => {
            const child = spawn('where', [program], { windowsHide: true });
            child.on('exit', code => resolve(code === 0));
        });
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
