import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Core
import { Problem } from './core/models';

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

    // 加载试题数据
    const problemsRoot = persistence.load();

    // 初始化 Providers
    const problemsProvider = new ProblemsTreeProvider(problemsRoot);
    const caseProvider = new CaseTreeProvider();
    const inputEditor = new EditorViewProvider(context);
    const outputEditor = new EditorViewProvider(context, true);
    const expectedOutputEditor = new EditorViewProvider(context);

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

    // 文件监听（用于 compile_commands.json）
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.cpp', false, true, false);
    watcher.onDidCreate(() => updateCompileCommands(state, config));
    watcher.onDidDelete(() => updateCompileCommands(state, config));

    // 配置变更
    config.onDidChange(() => {
        updateCompileCommands(state, config);
    });

    state.onPresetChanged(() => {
        updateCompileCommands(state, config);
        vscode.commands.executeCommand('clangd.restart');
    });

    state.onOverrideChanged(() => {
        updateCompileCommands(state, config);
        compiler.clearCache();
    });

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
 * 更新 compile_commands.json
 */
function updateCompileCommands(state: StateManager, config: ConfigService): void {
    if (!config.get<boolean>('generate_compile_commands')) { return; }
    
    const preset = state.getEffectivePreset();
    if (!preset) { return; }

    const workspace = config.workspacePath;
    if (!workspace) { return; }

    const srcBase = config.srcBasePath;
    const buildBase = config.buildBasePath;
    const outputDir = path.join(workspace, config.get<string>('compile_commands_path') || '');

    // 生成 compile_commands.json
    const commands = generateCompileCommands(preset, srcBase, buildBase);
    
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'compile_commands.json'), JSON.stringify(commands, null, 2));
}

/**
 * 生成 compile_commands.json 内容
 */
function generateCompileCommands(preset: any, srcBase: string, buildBase: string): object[] {
    const commands: object[] = [];
    
    function scanDir(dir: string): void {
        if (!fs.existsSync(dir)) { return; }
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.name.endsWith('.cpp')) {
                commands.push({
                    directory: srcBase,
                    command: preset.generateCompileCommand(fullPath, srcBase, buildBase),
                    file: fullPath
                });
            }
        }
    }

    scanDir(srcBase);
    return commands;
}

export function deactivate(): void {
    // 清理由服务管理
}
