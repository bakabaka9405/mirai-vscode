import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CaseViewProvider, CaseNode, CaseGroup } from './caseView'
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer'
import { loadProblems, saveProblems } from './problemPersistence'
import { doTest, doSingleTest, clearCompileCache } from './codeRunner'
import { startListen } from './listener';
import { Editor } from './editor';
import { TestPreset } from './testPreset';
import { getConfig, onDidConfigChanged, testPresets } from "./config";

let problemsExplorerView: vscode.TreeView<ProblemsItem>;
let caseView: vscode.TreeView<CaseNode>;

let currentTestPresetLabel: string | undefined;
let currentTestPreset: TestPreset | undefined;

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

	registerCommand('caseView.testAllCase', async () => {
		await vscode.workspace.saveAll(false);
		if (!currentTestPreset) {
			vscode.window.showErrorMessage("未选择编译测试预设");
			return;
		}
		await doTest(currentTestPreset, caseViewProvider.getChildren(), caseViewProvider, caseView);
		showCurrentCaseContent();
	});

	registerCommand('caseView.testSingleCase', async (element: CaseNode) => {
		await vscode.workspace.saveAll(false);
		caseView.reveal(element);
		element.iconPath = undefined;
		caseViewProvider.refresh(element);
		if (!currentTestPreset) {
			vscode.window.showErrorMessage("未选择编译测试预设");
			return;
		}
		await doSingleTest(currentTestPreset, element);
		caseViewProvider.refresh(element);
	});

	async function saveCurrentCaseContent() {
		if (inputEditor && outputEditor && expectedOutputEditor && caseViewProvider.current_case) {
			const [inputContent, outputContent, expectedOutputContent] = await Promise.all([
				inputEditor.getText(),
				outputEditor.getText(),
				expectedOutputEditor.getText()
			]);
			if (caseViewProvider.current_case) {
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
	}

	registerCommand('caseView.switchCase', async (element: CaseNode | undefined) => {
		await saveCurrentCaseContent();
		caseViewProvider.current_case = element;
		showCurrentCaseContent();
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
		}
	});

	onDidConfigChanged(() => {
		if (currentTestPresetLabel) {
			currentTestPreset = testPresets.find((preset) => preset.label == currentTestPresetLabel);
			if (!currentTestPreset) {
				currentTestPresetLabel = undefined;
				statusBarTestPreset.text = "编译测试预设";
			}
		}
	})

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
