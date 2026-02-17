import * as vscode from 'vscode';
import { IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';
import { BaseCompiledHandler } from './BaseCompiledHandler';

/**
 * C 语言处理器
 */
export class CHandler extends BaseCompiledHandler {
    readonly languageId = 'c';
    readonly displayName = 'C';
    readonly fileExtensions = ['c', 'h'];

    protected getCompilerPath(preset: LanguagePreset): string {
        return preset.compilerPath || 'gcc';
    }

    protected getCompileArgs(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string[] {
        const args: string[] = [];
        
        if (preset.std) {
            args.push(`-std=${preset.std}`);
        }
        if (preset.optimization) {
            args.push(`-${preset.optimization}`);
        }
        if (preset.additionalArgs) {
            args.push(...preset.additionalArgs);
        }
        if (preset.additionalIncludePaths) {
            args.push(...preset.additionalIncludePaths.map(p => `-I${p}`));
        }
        
        args.push(srcFile);
        args.push('-o');
        args.push(this.getOutputFile(srcFile, basePath, outputPath));
        
        return args;
    }

    validatePreset(preset: LanguagePreset): string | null {
        if (!preset.compilerPath) {
            return '未指定编译器路径';
        }
        return null;
    }

    getSupportedDebuggers(): IDebuggerInfo[] {
        return [
            { type: 'lldb', extensionId: 'vadimcn.vscode-lldb', displayName: 'CodeLLDB' },
            { type: 'cppdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (GDB/LLDB)' },
            { type: 'cppvsdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (MSVC)' },
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

        const outputFile = this.getOutputFile(srcFile, basePath, outputPath);
        
        return {
            type: debuggerType,
            extensionId: this.getDebuggerExtensionId(debuggerType),
            request: 'launch',
            name: 'Debug C',
            program: outputFile,
            args: [],
            cwd: '${workspaceFolder}',
        };
    }

    applyDebugMode(preset: LanguagePreset): void {
        if (!preset.additionalArgs) {
            preset.additionalArgs = [];
        }
        if (!preset.additionalArgs.includes('-g') && !preset.additionalArgs.some(a => a.startsWith('-gdwarf'))) {
            preset.additionalArgs.push('-gdwarf-4');
        }
        preset.optimization = 'O0';
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
