import * as vscode from 'vscode';
import { LanguagePreset, Problem, TestCase } from '../core/models';
import { LanguageHandlerRegistry } from '../core/handlers';
import { ConfigService } from '../services';

interface ILanguageSelectionState {
    presetKey?: string;
    overrideStd?: string;
    overrideOptimization?: string;
    overrideTimeLimit?: number;
}

/**
 * 全局状态管理器 - 管理扩展的运行时状态
 */
export class StateManager {
    private static instance: StateManager;
    private config: ConfigService;
    private workspaceState?: vscode.Memento;
    private readonly selectionStorageKey = 'mirai-vscode.languageSelections';
    private _languageSelections: Record<string, ILanguageSelectionState> = {};

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
        
        // 配置变更时重新绑定当前语言的预设对象
        this.config.onDidChange(() => {
            if (!this._currentPreset) {
                return;
            }

            if (!this.switchToLanguage(this._currentPreset.languageId)) {
                this.clearActiveSelection();
            }
        });
    }

    static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager();
        }
        return StateManager.instance;
    }

    initialize(context: vscode.ExtensionContext): void {
        this.workspaceState = context.workspaceState;
        this._languageSelections = context.workspaceState.get<Record<string, ILanguageSelectionState>>(
            this.selectionStorageKey,
            {}
        );
    }

    // 预设相关
    get currentPreset(): LanguagePreset | undefined {
        return this._currentPreset;
    }

    set currentPreset(preset: LanguagePreset | undefined) {
        if (!preset) {
            this.clearActiveSelection();
            return;
        }

        this.applyLanguageSelection(preset);
    }

    getPreferredPresetForLanguage(languageId: string): LanguagePreset | undefined {
        const presets = this.config.getPresetsByLanguage(languageId);
        if (presets.length === 0) {
            return undefined;
        }

        const rememberedKey = this._languageSelections[languageId]?.presetKey;
        if (rememberedKey) {
            const rememberedPreset = presets.find(p => p.getStorageKey() === rememberedKey);
            if (rememberedPreset) {
                return rememberedPreset;
            }
        }

        return presets[0];
    }

    switchToLanguage(languageId: string): boolean {
        const preset = this.getPreferredPresetForLanguage(languageId);
        if (!preset) {
            return false;
        }

        this.applyLanguageSelection(preset);
        return true;
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
        if (this._overrideStd === value) {
            return;
        }
        this._overrideStd = value;
        this._onOverrideChanged.fire();
        this.rememberCurrentLanguageSelection();
    }

    get overrideOptimization(): string | undefined {
        return this._overrideOptimization;
    }

    set overrideOptimization(value: string | undefined) {
        if (this._overrideOptimization === value) {
            return;
        }
        this._overrideOptimization = value;
        this._onOverrideChanged.fire();
        this.rememberCurrentLanguageSelection();
    }

    get overrideTimeLimit(): number | undefined {
        return this._overrideTimeLimit;
    }

    set overrideTimeLimit(value: number | undefined) {
        if (this._overrideTimeLimit === value) {
            return;
        }
        this._overrideTimeLimit = value;
        this._onOverrideChanged.fire();
        this.rememberCurrentLanguageSelection();
    }

    private applyLanguageSelection(preset: LanguagePreset): void {
        const selection = this._languageSelections[preset.languageId];
        const presetChanged = this._currentPreset !== preset;
        const overrideChanged = this._overrideStd !== selection?.overrideStd
            || this._overrideOptimization !== selection?.overrideOptimization
            || this._overrideTimeLimit !== selection?.overrideTimeLimit;

        this._currentPreset = preset;
        this._overrideStd = selection?.overrideStd;
        this._overrideOptimization = selection?.overrideOptimization;
        this._overrideTimeLimit = selection?.overrideTimeLimit;

        if (presetChanged) {
            this._onPresetChanged.fire(preset);
        }
        if (overrideChanged) {
            this._onOverrideChanged.fire();
        }

        this.rememberCurrentLanguageSelection();
    }

    private clearActiveSelection(): void {
        const presetChanged = this._currentPreset !== undefined;
        const overrideChanged = this._overrideStd !== undefined
            || this._overrideOptimization !== undefined
            || this._overrideTimeLimit !== undefined;

        this._currentPreset = undefined;
        this._overrideStd = undefined;
        this._overrideOptimization = undefined;
        this._overrideTimeLimit = undefined;

        if (presetChanged) {
            this._onPresetChanged.fire(undefined);
        }
        if (overrideChanged) {
            this._onOverrideChanged.fire();
        }
    }

    private rememberCurrentLanguageSelection(): void {
        if (!this._currentPreset) {
            return;
        }

        const languageId = this._currentPreset.languageId;
        const selection: ILanguageSelectionState = {
            presetKey: this._currentPreset.getStorageKey()
        };

        if (this._overrideStd !== undefined) {
            selection.overrideStd = this._overrideStd;
        }
        if (this._overrideOptimization !== undefined) {
            selection.overrideOptimization = this._overrideOptimization;
        }
        if (this._overrideTimeLimit !== undefined) {
            selection.overrideTimeLimit = this._overrideTimeLimit;
        }

        this._languageSelections[languageId] = selection;
        if (this.workspaceState) {
            void this.workspaceState.update(this.selectionStorageKey, this._languageSelections);
        }
    }

    dispose(): void {
        this._onPresetChanged.dispose();
        this._onProblemChanged.dispose();
        this._onCaseChanged.dispose();
        this._onOverrideChanged.dispose();
    }
}
