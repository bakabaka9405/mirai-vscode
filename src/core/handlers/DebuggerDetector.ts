import * as vscode from 'vscode';
import { IDebuggerInfo } from './ILanguageHandler';

/**
 * 调试器检测器
 * 
 * 检测已安装的调试器扩展并提供安装建议
 */
export class DebuggerDetector {
    /**
     * 各语言支持的调试器映射
     */
    private static readonly DEBUGGER_MAP: Record<string, IDebuggerInfo[]> = {
        cpp: [
            { type: 'lldb', extensionId: 'vadimcn.vscode-lldb', displayName: 'CodeLLDB' },
            { type: 'cppdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (GDB/LLDB)' },
            { type: 'cppvsdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (MSVC)' },
        ],
        c: [
            { type: 'lldb', extensionId: 'vadimcn.vscode-lldb', displayName: 'CodeLLDB' },
            { type: 'cppdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (GDB/LLDB)' },
            { type: 'cppvsdbg', extensionId: 'ms-vscode.cpptools', displayName: 'C/C++ (MSVC)' },
        ],
        python: [
            { type: 'debugpy', extensionId: 'ms-python.debugpy', displayName: 'Python Debugger' },
            { type: 'python', extensionId: 'ms-python.python', displayName: 'Python' },
        ],
        java: [
            { type: 'java', extensionId: 'vscjava.vscode-java-debug', displayName: 'Debugger for Java' },
        ],
        rust: [
            { type: 'lldb', extensionId: 'vadimcn.vscode-lldb', displayName: 'CodeLLDB' },
        ],
    };

    /**
     * 检查扩展是否已安装
     */
    static isExtensionInstalled(extensionId: string): boolean {
        return vscode.extensions.getExtension(extensionId) !== undefined;
    }

    /**
     * 获取语言可用的调试器
     * 
     * @param languageId 语言标识符
     * @returns 第一个已安装的调试器信息，如果没有则返回 undefined
     */
    static getAvailableDebugger(languageId: string): IDebuggerInfo | undefined {
        const debuggers = this.DEBUGGER_MAP[languageId] || [];
        for (const dbg of debuggers) {
            if (this.isExtensionInstalled(dbg.extensionId)) {
                return dbg;
            }
        }
        return undefined;
    }

    /**
     * 获取语言支持的所有调试器
     */
    static getSupportedDebuggers(languageId: string): IDebuggerInfo[] {
        return this.DEBUGGER_MAP[languageId] || [];
    }

    /**
     * 获取语言已安装的所有调试器
     */
    static getInstalledDebuggers(languageId: string): IDebuggerInfo[] {
        const debuggers = this.DEBUGGER_MAP[languageId] || [];
        return debuggers.filter(dbg => this.isExtensionInstalled(dbg.extensionId));
    }

    /**
     * 提示用户安装调试器扩展
     * 
     * @param languageId 语言标识符
     * @returns 是否成功触发安装
     */
    static async promptInstallDebugger(languageId: string): Promise<boolean> {
        const debuggers = this.DEBUGGER_MAP[languageId] || [];
        if (debuggers.length === 0) {
            vscode.window.showErrorMessage(`不支持 ${languageId} 的调试`);
            return false;
        }

        const recommended = debuggers[0];
        const selection = await vscode.window.showErrorMessage(
            `未找到 ${languageId} 的调试器扩展`,
            `安装 ${recommended.displayName}`
        );

        if (selection) {
            await vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                recommended.extensionId
            );
            return true;
        }

        return false;
    }

    /**
     * 让用户选择调试器
     * 
     * @param languageId 语言标识符
     * @returns 选择的调试器信息，如果取消则返回 undefined
     */
    static async selectDebugger(languageId: string): Promise<IDebuggerInfo | undefined> {
        const installed = this.getInstalledDebuggers(languageId);
        
        if (installed.length === 0) {
            await this.promptInstallDebugger(languageId);
            return undefined;
        }

        if (installed.length === 1) {
            return installed[0];
        }

        // 多个调试器可用，让用户选择
        const items = installed.map(dbg => ({
            label: dbg.displayName,
            description: dbg.type,
            debugger: dbg
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择调试器'
        });

        return selected?.debugger;
    }

    /**
     * 检查是否有任何调试器可用
     */
    static hasAnyDebugger(languageId: string): boolean {
        return this.getAvailableDebugger(languageId) !== undefined;
    }
}
