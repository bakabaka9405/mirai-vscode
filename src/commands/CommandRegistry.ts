import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StateManager } from '../state';
import { ConfigService, CompilerService, RunnerService } from '../services';
import { ProblemsTreeProvider, ProblemTreeItem } from '../providers';
import { TestCase, TestStatus } from '../core/models';

/**
 * 命令注册器 - 集中管理所有命令
 */
export class CommandRegistry {
    private disposables: vscode.Disposable[] = [];
    private state: StateManager;
    private config: ConfigService;
    private compiler: CompilerService;
    private runner: RunnerService;

    constructor(
        private context: vscode.ExtensionContext,
        private problemsProvider: ProblemsTreeProvider,
        private caseProvider: any, // CaseTreeProvider
        private inputEditor: any,  // EditorViewProvider
        private outputEditor: any,
        private expectedOutputEditor: any
    ) {
        this.state = StateManager.getInstance();
        this.config = ConfigService.getInstance();
        this.compiler = CompilerService.getInstance();
        this.runner = RunnerService.getInstance();
    }

    registerAll(): void {
        this.registerProblemsCommands();
        this.registerCaseCommands();
        this.registerTestCommands();
        this.registerEditorCommands();
        this.registerPresetCommands();
    }

    private register(command: string, callback: (...args: any[]) => any): void {
        const disposable = vscode.commands.registerCommand(command, callback);
        this.disposables.push(disposable);
        this.context.subscriptions.push(disposable);
    }

    private registerProblemsCommands(): void {
        this.register('problemsExplorer.addProblem', (item?: ProblemTreeItem) => {
            this.problemsProvider.addProblem(item?.problem);
        });

        this.register('problemsExplorer.addFolder', () => {
            this.problemsProvider.addFolder();
        });

        this.register('problemsExplorer.addFolderInline', (item?: ProblemTreeItem) => {
            this.problemsProvider.addFolder(item?.problem);
        });

        this.register('problemsExplorer.addProblemFromFolder', () => {
            // TODO: 实现从文件夹添加试题
        });

        this.register('problemsExplorer.renameProblemOrFolder', (item: ProblemTreeItem) => {
            this.problemsProvider.rename(item.problem);
        });

        this.register('problemsExplorer.deleteProblem', (item: ProblemTreeItem) => {
            this.problemsProvider.delete(item.problem);
        });

        this.register('problemsExplorer.openProblemUrl', (item: ProblemTreeItem) => {
            if (item.problem.url) {
                vscode.env.openExternal(vscode.Uri.parse(item.problem.url));
            } else {
                vscode.window.showErrorMessage('找不到该题目的链接');
            }
        });

        this.register('problemsExplorer.copyProblemUrl', (item: ProblemTreeItem) => {
            if (item.problem.url) {
                vscode.env.clipboard.writeText(item.problem.url);
                vscode.window.showInformationMessage('已复制');
            } else {
                vscode.window.showErrorMessage('找不到该题目的链接');
            }
        });

        this.register('problemsExplorer.openProblemCode', (item: ProblemTreeItem) => {
            const workspace = this.config.workspacePath;
            if (!workspace) {
                vscode.window.showErrorMessage('未打开工作区');
                return;
            }

            const srcBase = this.config.get<string>('src_base_dir') || '';
            const filePath = path.join(workspace, srcBase, item.problem.getPath() + '.cpp');
            
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '');
            }
            vscode.window.showTextDocument(vscode.Uri.file(filePath));
        });

        this.register('problemsExplorer.switchProblem', async (item: ProblemTreeItem) => {
            await this.saveCurrentCase();
            this.state.currentProblem = item.problem;
            this.caseProvider.switchCases(item.problem.cases);
            this.showCurrentCase();
        });
    }

    private registerCaseCommands(): void {
        this.register('caseView.addCase', () => {
            if (!this.state.currentProblem) {
                vscode.window.showErrorMessage('当前未选中试题');
                return;
            }
            const testCase = this.caseProvider.addCase();
            if (testCase) {
                this.state.currentProblem.cases.push(testCase);
            }
        });

        this.register('caseView.deleteCase', (item: any) => {
            this.caseProvider.deleteCase(item.testCase);
            const problem = this.state.currentProblem;
            if (problem) {
                const index = problem.cases.indexOf(item.testCase);
                if (index >= 0) {
                    problem.cases.splice(index, 1);
                }
            }
        });

        this.register('caseView.renameCase', (item: any) => {
            this.caseProvider.renameCase(item.testCase);
        });

        this.register('caseView.switchCase', async (testCase: TestCase) => {
            await this.saveCurrentCase();
            this.state.currentCase = testCase;
            this.caseProvider.current = testCase;
            this.showCurrentCase();
            this.inputEditor.reveal();
        });

        this.register('caseView.searchCasesInFolder', async () => {
            if (!this.state.currentProblem) {
                vscode.window.showErrorMessage('当前未选中试题');
                return;
            }
            // TODO: 实现从文件夹搜索样例
        });

        this.register('caseView.setting', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bakabaka9405.mirai-vscode');
        });

        this.register('caseView.clearCompileCache', () => {
            this.compiler.clearCache();
            vscode.window.showInformationMessage('已清除');
        });

        this.register('caseView.stopRunning', () => {
            this.runner.stopRunning();
        });
    }

    private registerTestCommands(): void {
        this.register('caseView.testAllCase', () => this.runAllTests(false));
        this.register('caseView.testAllCaseForceCompile', () => this.runAllTests(true));
        this.register('caseView.testSingleCase', (item: any) => this.runSingleTest(item.testCase, false));
        
        this.register('explorer.compileAndRun', () => this.compileAndRun(false));
        this.register('explorer.compileAndRunForceCompile', () => this.compileAndRun(true));
        
        this.register('startDebugging', () => this.startDebugging());
        this.register('caseView.debugCase', (item: any) => this.startDebugging(item.testCase));
    }

    private registerEditorCommands(): void {
        this.register('outputView.copyOutput', async () => {
            const content = await this.outputEditor.getText();
            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage('已复制');
        });

        this.register('expectedOutputView.contrast', async () => {
            const os = require('os');
            const file1 = path.join(os.tmpdir(), 'contrast_lt.txt');
            const file2 = path.join(os.tmpdir(), 'contrast_rt.txt');

            const [output, expected] = await Promise.all([
                this.outputEditor.getText(),
                this.expectedOutputEditor.getText()
            ]);

            fs.writeFileSync(file1, output);
            fs.writeFileSync(file2, expected);

            vscode.commands.executeCommand('vscode.diff',
                vscode.Uri.file(file1),
                vscode.Uri.file(file2),
                '输出↔期望输出'
            );
        });
    }

    private registerPresetCommands(): void {
        this.register('mirai-vscode.onBtnToggleTestPresetClicked', async () => {
            const presets = this.config.testPresets;
            if (presets.length === 0) {
                vscode.window.showErrorMessage('没有预设');
                return;
            }

            const items = presets.map((preset, index) => ({
                label: preset.label,
                description: preset.description,
                index
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: items[0].label
            });

            if (selected) {
                this.state.currentPreset = presets[selected.index];
                this.compiler.clearCache();
            }
        });

        this.register('mirai-vscode.onBtnToggleOverridingStdClicked', async () => {
            if (!this.state.currentPreset) {
                vscode.window.showErrorMessage('未选择编译预设');
                return;
            }

            const current = this.state.currentPreset.std;
            const items = [
                current ? `不改变（${current}）` : '不改变',
                'c++98', 'c++11', 'c++14', 'c++17', 'c++20', 'c++23', 'c++26'
            ];

            const selected = await vscode.window.showQuickPick(items);
            if (selected) {
                this.state.overrideStd = items.indexOf(selected) === 0 ? undefined : selected;
                this.compiler.clearCache();
            }
        });

        this.register('mirai-vscode.onBtnToggleOverridingOptimizationClicked', async () => {
            if (!this.state.currentPreset) {
                vscode.window.showErrorMessage('未选择编译预设');
                return;
            }

            const current = this.state.currentPreset.optimization || '默认';
            const items = [`不改变（${current}）`, '默认', 'O0', 'O1', 'O2', 'O3', 'Ofast', 'Og', 'Os'];

            const selected = await vscode.window.showQuickPick(
                items.map((label, index) => ({ label, index }))
            );

            if (selected) {
                if (selected.index === 0) {
                    this.state.overrideOptimization = undefined;
                } else if (selected.index === 1) {
                    this.state.overrideOptimization = '';
                } else {
                    this.state.overrideOptimization = selected.label;
                }
                this.compiler.clearCache();
            }
        });

        this.register('mirai-vscode.onBtnToggleOverridingTimeLimitClicked', async () => {
            if (!this.state.currentPreset) {
                vscode.window.showErrorMessage('未选择编译预设');
                return;
            }

            const current = this.state.currentPreset.timeoutSec;
            const items = [
                current ? `不改变（${current}秒）` : '不改变',
                '无限制', '1秒', '2秒', '3秒', '5秒', '10秒', '20秒', '30秒', '60秒'
            ];

            const selected = await vscode.window.showQuickPick(
                items.map((label, index) => ({ label, index }))
            );

            if (selected) {
                if (selected.index === 0) {
                    this.state.overrideTimeLimit = undefined;
                } else if (selected.index === 1) {
                    this.state.overrideTimeLimit = 0;
                } else {
                    this.state.overrideTimeLimit = parseInt(selected.label.replace('秒', ''));
                }
            }
        });
    }

    // 辅助方法
    private async ensurePreset(): Promise<boolean> {
        if (!this.state.currentPreset) {
            await vscode.commands.executeCommand('mirai-vscode.onBtnToggleTestPresetClicked');
        }
        return !!this.state.currentPreset;
    }

    private async saveCurrentCase(): Promise<void> {
        const testCase = this.state.currentCase;
        if (testCase) {
            const [input, output, expected] = await Promise.all([
                this.inputEditor.getText(),
                this.outputEditor.getText(),
                this.expectedOutputEditor.getText()
            ]);
            testCase.input = input;
            testCase.output = output;
            testCase.expectedOutput = expected;
        }
    }

    private showCurrentCase(): void {
        const testCase = this.state.currentCase || this.caseProvider.current;
        if (testCase) {
            this.inputEditor.setText(testCase.input);
            this.outputEditor.setText(testCase.output);
            this.expectedOutputEditor.setText(testCase.expectedOutput);
        } else {
            this.inputEditor.setText('');
            this.outputEditor.setText('');
            this.expectedOutputEditor.setText('');
        }
    }

    private async runAllTests(force: boolean): Promise<void> {
        await vscode.workspace.saveAll(false);
        if (!await this.ensurePreset()) {
            vscode.window.showErrorMessage('未选择编译测试预设');
            return;
        }

        const preset = this.state.getEffectivePreset()!;
        const srcFile = vscode.window.activeTextEditor?.document.fileName;
        if (!srcFile) {
            vscode.window.showErrorMessage('未打开文件');
            return;
        }

        const result = await this.compiler.compile(preset, srcFile, force);
        if (!result.success) {
            vscode.window.showErrorMessage(`编译失败：${result.message}`, '查看详细信息')
                .then(v => { if (v) { this.compiler.showOutput(); } });
            return;
        }

        this.inputEditor.reveal();
        const cases = this.caseProvider.allCases;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在测试...',
            cancellable: true
        }, async (progress, token) => {
            for (const testCase of cases) {
                if (token.isCancellationRequested) { break; }
                if (!testCase.enabled) { continue; }

                testCase.result = { status: TestStatus.Running };
                this.caseProvider.refresh();

                testCase.result = await this.runner.runTest(preset, testCase, token);
                this.caseProvider.refresh();
                progress.report({ increment: 100 / cases.length });
            }
        });

        this.showCurrentCase();
        vscode.window.showInformationMessage('测试完成');
    }

    private async runSingleTest(testCase: TestCase, force: boolean): Promise<void> {
        await vscode.workspace.saveAll(false);
        if (!await this.ensurePreset()) {
            vscode.window.showErrorMessage('未选择编译测试预设');
            return;
        }

        const preset = this.state.getEffectivePreset()!;
        const srcFile = vscode.window.activeTextEditor?.document.fileName;
        if (!srcFile) {
            vscode.window.showErrorMessage('未打开文件');
            return;
        }

        const result = await this.compiler.compile(preset, srcFile, force);
        if (!result.success) {
            vscode.window.showErrorMessage(`编译失败：${result.message}`, '查看详细信息')
                .then(v => { if (v) { this.compiler.showOutput(); } });
            return;
        }

        testCase.result = { status: TestStatus.Running };
        this.caseProvider.refresh();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在测试...',
            cancellable: true
        }, async (_, token) => {
            testCase.result = await this.runner.runTest(preset, testCase, token);
        });

        this.caseProvider.refresh();
        this.showCurrentCase();
    }

    private async compileAndRun(force: boolean): Promise<void> {
        await vscode.workspace.saveAll(false);
        if (!await this.ensurePreset()) {
            vscode.window.showErrorMessage('未选择编译测试预设');
            return;
        }

        const preset = this.state.getEffectivePreset()!;
        const srcFile = vscode.window.activeTextEditor?.document.fileName;
        if (!srcFile) {
            vscode.window.showErrorMessage('未打开文件');
            return;
        }

        const result = await this.compiler.compile(preset, srcFile, force);
        if (!result.success) {
            vscode.window.showErrorMessage(`编译失败：${result.message}`, '查看详细信息')
                .then(v => { if (v) { this.compiler.showOutput(); } });
            return;
        }

        const execFile = preset.getExecutableFile(srcFile, this.config.srcBasePath, this.config.buildBasePath);
        const terminal = vscode.window.createTerminal('mirai-vscode:编译运行');
        terminal.sendText(`& "${execFile}"`);
        terminal.show();
    }

    private async startDebugging(testCase?: TestCase): Promise<void> {
        await vscode.workspace.saveAll(false);
        if (!await this.ensurePreset()) {
            vscode.window.showErrorMessage('未选择编译测试预设');
            return;
        }

        const preset = this.state.getEffectivePreset(true)!;
        const srcFile = vscode.window.activeTextEditor?.document.fileName;
        if (!srcFile) {
            vscode.window.showErrorMessage('未打开文件');
            return;
        }

        const result = await this.compiler.compile(preset, srcFile);
        if (!result.success) {
            vscode.window.showErrorMessage(`编译失败：${result.message}`, '查看详细信息')
                .then(v => { if (v) { this.compiler.showOutput(); } });
            return;
        }

        const execFile = preset.getExecutableFile(srcFile, this.config.srcBasePath, this.config.buildBasePath);
        let tmpFile: string | undefined;

        if (testCase) {
            const os = require('os');
            tmpFile = path.join(os.tmpdir(), 'mirai-vscode-debug.tmp');
            fs.writeFileSync(tmpFile, testCase.input);
        }

        const folder = vscode.workspace.workspaceFolders?.[0];
        await vscode.debug.startDebugging(folder, {
            type: 'lldb',
            name: 'Debug',
            request: 'launch',
            program: execFile,
            args: [],
            cwd: '${workspaceFolder}',
            stdio: [testCase ? tmpFile : null, null, null]
        });
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
