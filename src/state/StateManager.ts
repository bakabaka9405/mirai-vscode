import * as vscode from 'vscode';
import { LanguagePreset, Problem, TestCase } from '../core/models';
import { LanguageHandlerRegistry } from '../core/handlers';
import { ConfigService } from '../services';

/**
 * 全局状态管理器 - 管理扩展的运行时状态
 */
export class StateManager {
    private static instance: StateManager;
    private config: ConfigService;

    // 当前选中的编译预设
    private _currentPreset?: LanguagePreset;
    // 当前选中的试题
    private _currentProblem?: Problem;
    // 当前选中的测试样例
    private _currentCase?: TestCase;

    // 重载设置
    private _overrideStd?: string;
    private _overrideOptimization?: string;
    private _overrideTimeLimit?: number;

    // 事件发射器
    private _onPresetChanged = new vscode.EventEmitter<LanguagePreset | undefined>();
    private _onProblemChanged = new vscode.EventEmitter<Problem | undefined>();
    private _onCaseChanged = new vscode.EventEmitter<TestCase | undefined>();
    private _onOverrideChanged = new vscode.EventEmitter<void>();

    readonly onPresetChanged = this._onPresetChanged.event;
    readonly onProblemChanged = this._onProblemChanged.event;
    readonly onCaseChanged = this._onCaseChanged.event;
    readonly onOverrideChanged = this._onOverrideChanged.event;

    private constructor() {
        this.config = ConfigService.getInstance();
        
        // 配置变更时重置预设
        this.config.onDidChange(() => {
            if (this._currentPreset) {
                this._currentPreset = undefined;
                this._onPresetChanged.fire(undefined);
            }
        });
    }

    static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager();
        }
        return StateManager.instance;
    }

    // 预设相关
    get currentPreset(): LanguagePreset | undefined {
        return this._currentPreset;
    }

    set currentPreset(preset: LanguagePreset | undefined) {
        this._currentPreset = preset;
        this._onPresetChanged.fire(preset);
    }

    /**
     * 获取应用了重载设置的预设
     * 
     * @param isDebugging 是否为调试模式
     */
    getEffectivePreset(isDebugging: boolean = false): LanguagePreset | undefined {
        if (!this._currentPreset) { return undefined; }

        const preset = this._currentPreset.clone();
        
        // 应用重载设置
        if (this._overrideStd) {
            preset.std = this._overrideStd;
        }
        if (this._overrideOptimization !== undefined) {
            preset.optimization = this._overrideOptimization;
        }
        if (this._overrideTimeLimit !== undefined) {
            preset.timeoutSec = this._overrideTimeLimit;
        }

        // 调试模式：应用语言特定的调试设置
        if (isDebugging) {
            const registry = LanguageHandlerRegistry.getInstance();
            const handler = registry.getHandler(preset.languageId);
            if (handler?.applyDebugMode) {
                handler.applyDebugMode(preset);
            } else {
                // 默认调试设置（C/C++ 风格）
                if (!preset.additionalArgs) {
                    preset.additionalArgs = [];
                }
                preset.additionalArgs.push('-gdwarf-4');
                preset.optimization = 'O0';
            }
        }

        return preset;
    }

    // 试题相关
    get currentProblem(): Problem | undefined {
        return this._currentProblem;
    }

    set currentProblem(problem: Problem | undefined) {
        this._currentProblem = problem;
        this._onProblemChanged.fire(problem);
    }

    // 测试样例相关
    get currentCase(): TestCase | undefined {
        return this._currentCase;
    }

    set currentCase(testCase: TestCase | undefined) {
        this._currentCase = testCase;
        this._onCaseChanged.fire(testCase);
    }

    // 重载设置
    get overrideStd(): string | undefined {
        return this._overrideStd;
    }

    set overrideStd(value: string | undefined) {
        this._overrideStd = value;
        this._onOverrideChanged.fire();
    }

    get overrideOptimization(): string | undefined {
        return this._overrideOptimization;
    }

    set overrideOptimization(value: string | undefined) {
        this._overrideOptimization = value;
        this._onOverrideChanged.fire();
    }

    get overrideTimeLimit(): number | undefined {
        return this._overrideTimeLimit;
    }

    set overrideTimeLimit(value: number | undefined) {
        this._overrideTimeLimit = value;
        this._onOverrideChanged.fire();
    }

    dispose(): void {
        this._onPresetChanged.dispose();
        this._onProblemChanged.dispose();
        this._onCaseChanged.dispose();
        this._onOverrideChanged.dispose();
    }
}
