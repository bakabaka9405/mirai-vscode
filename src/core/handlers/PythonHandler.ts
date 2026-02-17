import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ILanguageHandler, ICompileResult, IRunCommand, IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';

/**
 * Python 语言处理器
 */
export class PythonHandler implements ILanguageHandler {
    readonly languageId = 'python';
    readonly displayName = 'Python';
    readonly fileExtensions = ['py', 'pyw'];

    needsCompilation(): boolean {
        return false;
    }

    async compile(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<ICompileResult> {
        // Python 不需要编译
        return { success: true, message: '无需编译', output: '' };
    }

    getOutputFile(srcFile: string, basePath: string, outputPath: string): string {
        // Python 直接运行源文件
        return srcFile;
    }

    getRunCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IRunCommand {
        const interpreter = this.detectInterpreter(preset, basePath);
        const args = [...(preset.runtimeArgs || []), srcFile];
        
        return {
            command: interpreter,
            args,
            cwd: path.dirname(srcFile)
        };
    }

    /**
     * 检测 Python 解释器
     * 
     * 优先级：
     * 1. 预设指定的解释器
     * 2. 工作区 venv
     * 3. 系统 Python
     */
    private detectInterpreter(preset: LanguagePreset, workspacePath: string): string {
        // 1. 预设指定
        if (preset.interpreterPath) {
            return preset.interpreterPath;
        }

        // 2. 检测 venv
        const venvPaths = this.getVenvPaths(workspacePath);
        for (const venvPath of venvPaths) {
            if (fs.existsSync(venvPath)) {
                return venvPath;
            }
        }

        // 3. 系统 Python
        return 'python';
    }

    /**
     * 获取可能的 venv Python 路径
     */
    private getVenvPaths(workspacePath: string): string[] {
        const isWindows = process.platform === 'win32';
        const pythonExe = isWindows ? 'python.exe' : 'python';
        const binDir = isWindows ? 'Scripts' : 'bin';

        const venvDirs = ['venv', '.venv', 'env', '.env'];
        const paths: string[] = [];

        for (const dir of venvDirs) {
            paths.push(path.join(workspacePath, dir, binDir, pythonExe));
        }

        return paths;
    }

    validatePreset(preset: LanguagePreset): string | null {
        // Python 预设基本不需要验证
        return null;
    }

    getSupportedDebuggers(): IDebuggerInfo[] {
        return [
            { type: 'debugpy', extensionId: 'ms-python.debugpy', displayName: 'Python Debugger' },
            { type: 'python', extensionId: 'ms-python.python', displayName: 'Python' },
        ];
    }

    getDebugConfig(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined {
        const debuggerType = preset.debuggerType || this.detectAvailableDebugger();
        if (!debuggerType) {
            return undefined;
        }

        const interpreter = this.detectInterpreter(preset, basePath);

        return {
            type: debuggerType,
            extensionId: this.getDebuggerExtensionId(debuggerType),
            request: 'launch',
            name: 'Debug Python',
            program: srcFile,
            python: interpreter,
            args: preset.runtimeArgs || [],
            cwd: path.dirname(srcFile),
            console: 'integratedTerminal',
        };
    }

    private detectAvailableDebugger(): string | undefined {
        const debuggers = this.getSupportedDebuggers();
        for (const dbg of debuggers) {
            if (vscode.extensions.getExtension(dbg.extensionId)) {
                return dbg.type;
            }
        }
        return undefined;
    }

    private getDebuggerExtensionId(debuggerType: string): string {
        const debuggers = this.getSupportedDebuggers();
        const found = debuggers.find(d => d.type === debuggerType);
        return found?.extensionId || '';
    }
}
