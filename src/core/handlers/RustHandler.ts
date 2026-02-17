import * as vscode from 'vscode';
import { IDebugConfig, IDebuggerInfo } from './ILanguageHandler';
import { LanguagePreset } from '../models/LanguagePreset';
import { BaseCompiledHandler } from './BaseCompiledHandler';

/**
 * Rust 语言处理器
 */
export class RustHandler extends BaseCompiledHandler {
    readonly languageId = 'rust';
    readonly displayName = 'Rust';
    readonly fileExtensions = ['rs'];

    protected getCompilerPath(preset: LanguagePreset): string {
        return preset.compilerPath || 'rustc';
    }

    protected getCompileArgs(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string[] {
        const args: string[] = [];
        
        // 优化级别
        if (preset.optimization) {
            // Rust 使用 -C opt-level=N 或 -O
            if (preset.optimization === 'O0') {
                args.push('-C', 'opt-level=0');
            } else if (preset.optimization === 'O1') {
                args.push('-C', 'opt-level=1');
            } else if (preset.optimization === 'O2') {
                args.push('-C', 'opt-level=2');
            } else if (preset.optimization === 'O3' || preset.optimization === 'Ofast') {
                args.push('-C', 'opt-level=3');
            } else if (preset.optimization === 'Os') {
                args.push('-C', 'opt-level=s');
            }
        }

        // 额外参数
        if (preset.additionalArgs) {
            args.push(...preset.additionalArgs);
        }

        // 输出文件
        args.push('-o', this.getOutputFile(srcFile, basePath, outputPath));
        
        // 源文件
        args.push(srcFile);
        
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
        ];
    }

    getDebugConfig(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined {
        const debuggerType = preset.debuggerType || 'lldb';
        
        // 检查调试器扩展是否安装
        if (!vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
            return undefined;
        }

        const outputFile = this.getOutputFile(srcFile, basePath, outputPath);
        
        return {
            type: debuggerType,
            extensionId: 'vadimcn.vscode-lldb',
            request: 'launch',
            name: 'Debug Rust',
            program: outputFile,
            args: [],
            cwd: '${workspaceFolder}',
        };
    }

    applyDebugMode(preset: LanguagePreset): void {
        if (!preset.additionalArgs) {
            preset.additionalArgs = [];
        }
        // Rust 调试需要 -g 标志
        if (!preset.additionalArgs.includes('-g')) {
            preset.additionalArgs.push('-g');
        }
        // 禁用优化
        preset.optimization = 'O0';
    }
}
