import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CaseViewProvider, CaseNode, CaseGroup } from './caseView'
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer'
import { loadProblems, saveProblems } from './problemPersistence'
import { doTest, doSingleTest, compileAndRun,doDebug, clearCompileCache } from './codeRunner'
import { startListen } from './listener';
import { Editor } from './editor';
import { TestPreset } from './testPreset';
import { getConfig, onDidConfigChanged, testPresets } from "./config";
import { generateAllCompileCommandJson } from "./compileCommandsGenerator"

let problemsExplorerView: vscode.TreeView<ProblemsItem>;
let caseView: vscode.TreeView<CaseNode>;

let currentTestPresetLabel: string | undefined;
let currentTestPreset: TestPreset | undefined;

let overridingStd: string | undefined;
let overridingOptimizaion: string | undefined;

function packTestPreset(isDebugging:boolean=false): TestPreset | undefined {
	if (!currentTestPreset) return undefined;
	let preset: TestPreset = TestPreset.fromObject(currentTestPreset);
	if (overridingStd) preset.std = overridingStd;
	if (overridingOptimizaion) preset.optimization = overridingOptimizaion;
	if (isDebugging) {
		preset.additionalArgs.push("-gdwarf-4");
		preset.optimization = "O0";
	}
	return preset;
}

let _onDidTestPresetChanged = new vscode.EventEmitter<TestPreset | undefined>();
export const onDidTestPresetChanged = _onDidTestPresetChanged.event;

let _onCompileCommandsNeedUpdate = new vscode.EventEmitter<void>();
export const onCompileCommandsNeedUpdate = _onCompileCommandsNeedUpdate.event;

export function activate(context: vscode.ExtensionContext) {
	function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): void {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback, thisArg));
	}
	// ProblemsExplorer
	const problemsExplorerProvider = new ProblemsExplorerProvider();
	problemsExplorerView = vscode.window.createTreeView('problemsExplorer', { treeDataProvider: problemsExplorerProvider });
	context.subscriptions.push(vscode.window.registerTreeDataProvider('problemsExplorer', problemsExplorerProvider));
	registerCommand('problemsExplorer.addProblem', () => {
		problemsExplorerProvider.onBtnAddProblemClicked();
	});
	registerCommand('problemsExplorer.addProblemFromFolder', () => { });
	registerCommand('problemsExplorer.renameProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.onBtnRenameProblemClicked(element);
	});
	registerCommand('problemsExplorer.deleteProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.onBtnDeleteProblemClicked(element);
	});
	registerCommand('problemsExplorer.openProblemUrl', (element: ProblemsItem) => {
		if (element.url) {
			vscode.env.openExternal(vscode.Uri.parse(element.url));
		}
		else {
			vscode.window.showErrorMessage("找不到该题目的链接");
		}
	});
	registerCommand('problemsExplorer.copyProblemUrl', (element: ProblemsItem) => {
		if (element.url) {
			vscode.env.clipboard.writeText(element.url);
			vscode.window.showInformationMessage("已复制");
		}
		else {
			vscode.window.showErrorMessage("找不到该题目的链接");
		}
	});
	registerCommand('problemsExplorer.switchGroupingMethod', () => {
		problemsExplorerProvider.onBtnSwitchGroupingMethodClicked();
	});
	registerCommand('problemsExplorer.switchProblem', async (element: ProblemsItem) => {
		await saveCurrentCaseContent();
		caseViewProvider.switchCaseGroup(element.caseGroup!);
		showCurrentCaseContent();
	});

	// CaseView
	const caseViewProvider = new CaseViewProvider();
	caseView = vscode.window.createTreeView('caseView', { treeDataProvider: caseViewProvider });
	context.subscriptions.push(vscode.window.registerTreeDataProvider('caseView', caseViewProvider));
	registerCommand('caseView.setting', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bakabaka9405.mirai-vscode');
	});
	registerCommand('caseView.addCase', () => {
		caseViewProvider.onBtnAddCaseClicked();
	});
	registerCommand('caseView.searchCasesInFolder', async () => {
		caseViewProvider.onBtnSearchCasesInFolderClicked();
	});
	registerCommand('caseView.deleteCase', (element: CaseNode) => {
		caseViewProvider.onBtnDeleteCaseClicked(element);
	});
	registerCommand('caseView.renameCase', (element: CaseNode) => {
		caseViewProvider.onBtnRenameCaseClicked(element);
	});
	registerCommand('caseView.clearCompileCache', () => {
		clearCompileCache();
		vscode.window.showInformationMessage("已清除");
	});

	registerCommand('explorer.compileAndRun', async () => {
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		compileAndRun(packTestPreset()!);
	});

	registerCommand('explorer.compileAndRunForceCompile', async () => {
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		compileAndRun(packTestPreset()!,true);
	});

	registerCommand('caseView.testAllCase', async () => {
		inputEditor.reveal();
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		await doTest(packTestPreset()!, caseViewProvider.getChildren(), caseViewProvider, caseView);
		showCurrentCaseContent();
	});

	registerCommand('caseView.testAllCaseForceCompile', async () => {
		inputEditor.reveal();
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		await doTest(packTestPreset()!, caseViewProvider.getChildren(), caseViewProvider, caseView,true);
		showCurrentCaseContent();
	});

	registerCommand('caseView.testSingleCase', async (element: CaseNode) => {
		await vscode.workspace.saveAll(false);
		caseView.reveal(element);
		element.iconPath = undefined;
		caseViewProvider.refresh(element);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		await doSingleTest(packTestPreset()!, element);
		caseViewProvider.refresh(element);
		showCurrentCaseContent();
	});

	registerCommand('caseView.debugCase', async (element: CaseNode) => {
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			await vscode.commands.executeCommand("mirai-vscode.onBtnToggleTestPresetClicked");
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未选择编译测试预设");
				return;
			}
		}
		await doDebug(packTestPreset(true)!);
	});

	async function saveCurrentCaseContent() {
		if (inputEditor && outputEditor && expectedOutputEditor && caseViewProvider.current_case) {
			if (caseViewProvider.current_case) {
				const [inputContent, outputContent, expectedOutputContent] = await Promise.all([
					inputEditor.getText(),
					outputEditor.getText(),
					expectedOutputEditor.getText()
				]);
				caseViewProvider.current_case.input = inputContent;
				caseViewProvider.current_case.output = outputContent;
				caseViewProvider.current_case.expectedOutput = expectedOutputContent;
			}
		}
	}

	function showCurrentCaseContent() {
		if (caseViewProvider.current_case) {
			inputEditor.setText(caseViewProvider.current_case.input);
			outputEditor.setText(caseViewProvider.current_case.output);
			expectedOutputEditor.setText(caseViewProvider.current_case.expectedOutput);
		}
		else {
			inputEditor.setText("");
			outputEditor.setText("");
			expectedOutputEditor.setText("");
		}
	}

	registerCommand('caseView.switchCase', async (element: CaseNode | undefined) => {
		await saveCurrentCaseContent();
		caseViewProvider.current_case = element;
		showCurrentCaseContent();
		inputEditor.reveal();
	});

	const inputEditor = new Editor(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider("inputView", inputEditor
		, { webviewOptions: { retainContextWhenHidden: true } }));
	inputEditor.onDidChange((data) => {
		if (caseViewProvider.current_case) {
			caseViewProvider.current_case.input = data;
		}
	});

	inputEditor.onLoad(() => {
		if (caseViewProvider.current_case) {
			inputEditor.setText(caseViewProvider.current_case.input);
		}
	});

	const outputEditor = new Editor(context, true);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider("outputView", outputEditor
		, { webviewOptions: { retainContextWhenHidden: true } }));
	outputEditor.onDidChange((data) => {
		if (caseViewProvider.current_case) {
			caseViewProvider.current_case.output = data;
		}
	});

	outputEditor.onLoad(() => {
		if (caseViewProvider.current_case) {
			outputEditor.setText(caseViewProvider.current_case.output);
		}
	});

	registerCommand('outputView.copyOutput', async () => {
		const content = await outputEditor.getText();
		await vscode.env.clipboard.writeText(content);
		vscode.window.showInformationMessage("已复制");
	});

	//expectedOutputView
	const expectedOutputEditor = new Editor(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider("expectedOutputView", expectedOutputEditor
		, { webviewOptions: { retainContextWhenHidden: true } }));
	expectedOutputEditor.onDidChange((data) => {
		if (caseViewProvider.current_case) {
			caseViewProvider.current_case.expectedOutput = data;
		}
	});

	expectedOutputEditor.onLoad(() => {
		if (caseViewProvider.current_case) {
			expectedOutputEditor.setText(caseViewProvider.current_case.expectedOutput);
		}
	});

	registerCommand('expectedOutputView.contrast', async () => {
		const os = require('os');
		let file1 = path.join(os.tmpdir(), 'contrast_lt.txt');
		let file2 = path.join(os.tmpdir(), 'contrast_rt.txt');

		const [output, expectedOutput] = await Promise.all([outputEditor.getText(), expectedOutputEditor.getText()]);

		fs.writeFileSync(file1, output);
		fs.writeFileSync(file2, expectedOutput);

		let uri1 = vscode.Uri.file(file1);
		let uri2 = vscode.Uri.file(file2);

		vscode.commands.executeCommand('vscode.diff', uri1, uri2, "输出↔期望输出");
	});

	// StatusBar

	let statusBarTestPreset = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusBarTestPreset.text = "编译测试预设";
	statusBarTestPreset.tooltip = "切换编译测试预设";
	statusBarTestPreset.command = "mirai-vscode.onBtnToggleTestPresetClicked";
	statusBarTestPreset.show();
	context.subscriptions.push(statusBarTestPreset);

	registerCommand('mirai-vscode.onBtnToggleTestPresetClicked', async () => {
		let items: { label: string, description: string }[] = testPresets.map((preset) => {
			return {
				label: preset.label,
				description: preset.description
			}
		});
		if (items.length == 0) {
			vscode.window.showErrorMessage("没有预设");
			return;
		}
		let selected = await vscode.window.showQuickPick(items, {
			placeHolder: items[0].label
		});

		if (selected) {
			currentTestPreset = testPresets.find((preset) => preset.label == selected!.label);
			if (!currentTestPreset) {
				vscode.window.showErrorMessage("未找到预设");
				statusBarTestPreset.text = "编译测试预设";
			}
			else {
				currentTestPresetLabel = statusBarTestPreset.text = currentTestPreset.label;
			}
			clearCompileCache();
			_onDidTestPresetChanged.fire(currentTestPreset);
		}
	});

	onDidConfigChanged(() => {
		if (currentTestPresetLabel) {
			currentTestPreset = testPresets.find((preset) => preset.label == currentTestPresetLabel);
			if (!currentTestPreset) {
				currentTestPresetLabel = undefined;
				statusBarTestPreset.text = "编译测试预设";
				_onDidTestPresetChanged.fire(undefined);
			}
		}
		_onCompileCommandsNeedUpdate.fire();
	});

	onDidTestPresetChanged((preset) => {
		_onCompileCommandsNeedUpdate.fire();
		if (!overridingStd) statusBarOverridingStd.text = preset?.std ? `不改变（${preset.std}）` : "不改变";
		if (!overridingOptimizaion) statusBarOverridingOptimization.text = preset?.optimization ? `不改变（${preset.optimization}）` : "不改变";
	});

	onCompileCommandsNeedUpdate(() => {
		if (currentTestPreset && getConfig<string>("generate_compile_commands")) {
			const compileCommands = generateAllCompileCommandJson(
				packTestPreset()!, path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, getConfig<string>("scan_base_dir") || ""));
			fs.writeFileSync(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath,
				getConfig<string>("compile_commands_path") || "", "compile_commands.json"),
				compileCommands);
		}
	});

	let statusBarOverridingStd = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusBarOverridingStd.text = "不改变";
	statusBarOverridingStd.tooltip = "重载语言标准";
	statusBarOverridingStd.command = "mirai-vscode.onBtnToggleOverridingStdClicked";
	statusBarOverridingStd.show();
	context.subscriptions.push(statusBarOverridingStd);

	registerCommand('mirai-vscode.onBtnToggleOverridingStdClicked', async () => {
		if (!currentTestPreset) {
			vscode.window.showErrorMessage("未选择编译预设");
			return;
		}
		let items = [currentTestPreset?.std ? `不改变（${currentTestPreset.std}）` : "不改变", "c++98", "c++11", "c++14", "c++17", "c++20", "c++23", "c++26"];
		let selected = await vscode.window.showQuickPick(items, {
			placeHolder: items[0]
		});

		if (selected) {
			if (items.findIndex(v => v == selected) == 0) overridingStd = undefined;
			else overridingStd = selected;
			statusBarOverridingStd.text = selected;
			_onCompileCommandsNeedUpdate.fire();
			clearCompileCache();
		}
	});

	let statusBarOverridingOptimization = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusBarOverridingOptimization.text = "不改变";
	statusBarOverridingOptimization.tooltip = "重载优化选项";
	statusBarOverridingOptimization.command = "mirai-vscode.onBtnToggleOverridingOptimizationClicked";
	statusBarOverridingOptimization.show();
	context.subscriptions.push(statusBarOverridingOptimization);

	registerCommand('mirai-vscode.onBtnToggleOverridingOptimizationClicked', async () => {
		if (!currentTestPreset) {
			vscode.window.showErrorMessage("未选择编译预设");
			return;
		}
		let items = [currentTestPreset?.optimization ? `不改变（${currentTestPreset.optimization}）` : "不改变", "O0", "O1", "O2", "O3", "Ofast", "Og", "Os"];
		let selected = await vscode.window.showQuickPick(items, {
			placeHolder: items[0]
		});

		if (selected) {
			if (items.findIndex(v => v == selected) == 0) overridingOptimizaion = undefined;
			else overridingOptimizaion = selected;
			statusBarOverridingOptimization.text = selected;
			_onCompileCommandsNeedUpdate.fire();
			clearCompileCache();
		}
	});

	let watcher = vscode.workspace.createFileSystemWatcher("**/*.cpp", false, true, false);
	console.log("watching");
	watcher.onDidCreate((e) => {
		_onCompileCommandsNeedUpdate.fire();
		console.log(`File created: ${e.path}`);
	});
	watcher.onDidDelete((e) => {
		_onCompileCommandsNeedUpdate.fire();
		console.log(`File deleted: ${e.path}`);
	});
	context.subscriptions.push(watcher);

	//load problems
	let problemsJson = loadProblems();
	problemsExplorerProvider.groupingMethod = problemsJson.groupingMethod || "None";
	problemsExplorerProvider.problems = problemsJson.problems.map((problem: { label: string; cases: CaseGroup; group?: string, url?: string }) => {
		let p = new ProblemsItem(problem.label, problem.group, problem.url);
		p.caseGroup!.data = Object.values(problem.cases).map((c) => {
			return new CaseNode(c.label, vscode.TreeItemCollapsibleState.None, undefined, c.input, "", c.expectedOutput);
		});
		return p;
	});
	problemsExplorerProvider.refresh();

	//save problems
	let timer = setInterval(() => {
		saveProblems(problemsExplorerProvider);
	}, 5000);
	context.subscriptions.push({ dispose: () => clearInterval(timer) });

	startListen(problemsExplorerProvider);
}

export function deactivate() {

}
