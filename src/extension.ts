import * as vscode from 'vscode';

// Core
import { Problem, LanguagePreset } from './core/models';
import { 
    LspConfigManager, 
    CppConfigGenerator, 
    PythonConfigGenerator, 
    RustConfigGenerator 
} from './core/lsp';
import { LanguageHandlerRegistry } from './core/handlers';

// Services
import { 
    ConfigService, 
    CompilerService, 
    PersistenceService, 
    ListenerService 
} from './services';

// Providers
import { 
    ProblemsTreeProvider, 
    ProblemTreeItem,
    CaseTreeProvider, 
    EditorViewProvider 
} from './providers';

// State & UI
import { StateManager } from './state';
import { StatusBarManager } from './ui';

// Commands
import { CommandRegistry } from './commands';

// LSP 配置管理器（模块级变量）
let lspConfigManager: LspConfigManager;

/**
 * 扩展激活入口
 */
export function activate(context: vscode.ExtensionContext): void {
    // 初始化服务（单例）
    const config = ConfigService.getInstance();
    const compiler = CompilerService.getInstance();
    const persistence = PersistenceService.getInstance();
    const listener = ListenerService.getInstance();
    const state = StateManager.getInstance();
    state.initialize(context);

    // 初始化 LSP 配置管理器
    lspConfigManager = new LspConfigManager();
    lspConfigManager.registerGenerator(new CppConfigGenerator());
    lspConfigManager.registerGenerator(new PythonConfigGenerator());
    lspConfigManager.registerGenerator(new RustConfigGenerator());

    // 加载试题数据
    const problemsRoot = persistence.load();

    // 初始化 Providers
    const problemsProvider = new ProblemsTreeProvider(problemsRoot);
    const caseProvider = new CaseTreeProvider(context.extensionUri);
    const inputEditor = new EditorViewProvider(context);
    const outputEditor = new EditorViewProvider(context, true);
    const expectedOutputEditor = new EditorViewProvider(context);

    inputEditor.onDidChange(data => {
        if (caseProvider.current) {
            caseProvider.current.input = data;
        }
    });

    outputEditor.onDidChange(data => {
        if (caseProvider.current) {
            caseProvider.current.output = data;
        }
    });

    expectedOutputEditor.onDidChange(data => {
        if (caseProvider.current) {
            caseProvider.current.expectedOutput = data;
        }
    });

    // 注册树视图
    const problemsTreeView = vscode.window.createTreeView('problemsExplorer', {
        treeDataProvider: problemsProvider,
        dragAndDropController: problemsProvider
    });

    const caseTreeView = vscode.window.createTreeView('caseView', {
        treeDataProvider: caseProvider
    });

    // 注册 Webview Providers
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('inputView', inputEditor, 
            { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider('outputView', outputEditor, 
            { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider('expectedOutputView', expectedOutputEditor, 
            { webviewOptions: { retainContextWhenHidden: true } })
    );

    // 注册命令
    const commands = new CommandRegistry(
        context,
        problemsProvider,
        caseProvider,
        inputEditor,
        outputEditor,
        expectedOutputEditor
    );
    commands.registerAll();

    // 状态栏
    const statusBar = new StatusBarManager(context);

    // 树视图事件
    problemsTreeView.onDidExpandElement(e => {
        (e.element as ProblemTreeItem).problem.collapsed = false;
    });
    problemsTreeView.onDidCollapseElement(e => {
        (e.element as ProblemTreeItem).problem.collapsed = true;
    });

    caseTreeView.onDidChangeCheckboxState(e => {
        for (const [item, checkState] of e.items) {
            (item as any).testCase.enabled = checkState === vscode.TreeItemCheckboxState.Checked;
        }
    });

    // 主题变更
    vscode.window.onDidChangeActiveColorTheme(() => {
        inputEditor.updateTheme();
        outputEditor.updateTheme();
        expectedOutputEditor.updateTheme();
    });

    // 文件监听（用于 LSP 配置更新）
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/*.{cpp,cc,cxx,c,py,rs}', 
        false, true, false
    );
    watcher.onDidCreate(() => updateLspConfigs(state, config));
    watcher.onDidDelete(() => updateLspConfigs(state, config));

    // 配置变更
    config.onDidChange(() => {
        syncPresetWithActiveEditor(vscode.window.activeTextEditor, state);
        updateLspConfigs(state, config);
    });

    state.onPresetChanged(preset => {
        void syncPythonInterpreterForPreset(preset, config);
        updateLspConfigs(state, config);
        vscode.commands.executeCommand('clangd.restart').then(undefined, () => {});
    });

    state.onOverrideChanged(() => {
        updateLspConfigs(state, config);
        compiler.clearCache();
    });

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            syncPresetWithActiveEditor(editor, state);
        })
    );

    syncPresetWithActiveEditor(vscode.window.activeTextEditor, state);

    // 启动 HTTP 监听
    listener.onProblemReceived(problem => {
        const group = (problem as any).group || 'Default';
        problemsProvider.root.getFolderOrCreate(group).push(problem);
        problemsProvider.refresh();
    });
    listener.start();

    // 自动保存
    persistence.startAutoSave(problemsProvider.root);

    // 注册 disposables
    context.subscriptions.push(
        problemsTreeView,
        caseTreeView,
        watcher,
        { dispose: () => persistence.stopAutoSave() },
        { dispose: () => listener.stop() },
        { dispose: () => statusBar.dispose() }
    );
}

/**
 * 统一接口：更新所有 LSP 配置
 */
async function updateLspConfigs(state: StateManager, config: ConfigService): Promise<void> {
    const preset = state.getEffectivePreset();
    if (!preset) { return; }

    await lspConfigManager.updateAllConfigs(
        preset,
        config.srcBasePath,
        config.buildBasePath
    );
}

function syncPresetWithActiveEditor(
    editor: vscode.TextEditor | undefined,
    state: StateManager
): void {
    const languageId = resolveDocumentLanguageId(editor?.document);
    if (!languageId) {
        return;
    }

    if (!state.switchToLanguage(languageId) && state.currentPreset?.languageId !== languageId) {
        state.currentPreset = undefined;
    }
}

function resolveDocumentLanguageId(document: vscode.TextDocument | undefined): string | undefined {
    if (!document) {
        return undefined;
    }

    const registry = LanguageHandlerRegistry.getInstance();
    if (registry.hasLanguage(document.languageId)) {
        return document.languageId;
    }

    return registry.detectLanguageId(document.fileName);
}

async function syncPythonInterpreterForPreset(
    preset: LanguagePreset | undefined,
    config: ConfigService
): Promise<void> {
    if (preset?.languageId !== 'python' || !preset.interpreterPath) {
        return;
    }

    await config.syncPythonInterpreter(preset.interpreterPath);
}

export function deactivate(): void {
}
