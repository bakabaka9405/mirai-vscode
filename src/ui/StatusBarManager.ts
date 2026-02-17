import * as vscode from 'vscode';
import { StateManager } from '../state';
import { ConfigService, CompilerService } from '../services';

/**
 * 状态栏管理器 - 管理所有状态栏项
 */
export class StatusBarManager {
    private items: vscode.StatusBarItem[] = [];
    private state: StateManager;
    private config: ConfigService;
    private compiler: CompilerService;

    constructor(context: vscode.ExtensionContext) {
        this.state = StateManager.getInstance();
        this.config = ConfigService.getInstance();
        this.compiler = CompilerService.getInstance();

        this.createPresetItem(context);
        this.createStdItem(context);
        this.createOptimizationItem(context);
        this.createTimeLimitItem(context);
    }

    private createPresetItem(context: vscode.ExtensionContext): void {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.text = '编译测试预设';
        item.tooltip = '切换编译测试预设';
        item.command = 'mirai-vscode.onBtnToggleTestPresetClicked';
        item.show();

        this.state.onPresetChanged(preset => {
            item.text = preset?.label || '编译测试预设';
        });

        this.items.push(item);
        context.subscriptions.push(item);
    }

    private createStdItem(context: vscode.ExtensionContext): void {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        item.text = '不改变';
        item.tooltip = '重载语言标准';
        item.command = 'mirai-vscode.onBtnToggleOverridingStdClicked';
        item.show();

        const updateText = () => {
            const preset = this.state.currentPreset;
            if (this.state.overrideStd) {
                item.text = this.state.overrideStd;
            } else {
                item.text = preset?.std ? `不改变（${preset.std}）` : '不改变（默认）';
            }
        };

        this.state.onPresetChanged(updateText);
        this.state.onOverrideChanged(updateText);

        this.items.push(item);
        context.subscriptions.push(item);
    }

    private createOptimizationItem(context: vscode.ExtensionContext): void {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        item.text = '不改变';
        item.tooltip = '重载优化选项';
        item.command = 'mirai-vscode.onBtnToggleOverridingOptimizationClicked';
        item.show();

        const updateText = () => {
            const preset = this.state.currentPreset;
            if (this.state.overrideOptimization !== undefined) {
                item.text = this.state.overrideOptimization || '默认';
            } else {
                item.text = preset?.optimization ? `不改变（${preset.optimization}）` : '不改变（默认）';
            }
        };

        this.state.onPresetChanged(updateText);
        this.state.onOverrideChanged(updateText);

        this.items.push(item);
        context.subscriptions.push(item);
    }

    private createTimeLimitItem(context: vscode.ExtensionContext): void {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        item.text = '不改变';
        item.tooltip = '重载时间限制';
        item.command = 'mirai-vscode.onBtnToggleOverridingTimeLimitClicked';
        item.show();

        const updateText = () => {
            const preset = this.state.currentPreset;
            if (this.state.overrideTimeLimit !== undefined) {
                item.text = this.state.overrideTimeLimit === 0 ? '无限制' : `${this.state.overrideTimeLimit}秒`;
            } else {
                item.text = preset?.timeoutSec ? `不改变（${preset.timeoutSec}秒）` : '不改变（无限制）';
            }
        };

        this.state.onPresetChanged(updateText);
        this.state.onOverrideChanged(updateText);

        this.items.push(item);
        context.subscriptions.push(item);
    }

    dispose(): void {
        this.items.forEach(item => item.dispose());
    }
}
