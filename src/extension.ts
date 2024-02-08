import * as vscode from 'vscode';
import { WebviewViewProvider } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CaseViewProvider, CaseNode, CaseGroup } from './caseView'
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer'
import { loadConfig, saveConfig } from './config'
import { doTest, doSingleTest } from './codeRunner'
import { startListen } from './listener';
import { start } from 'repl';
import { Editor } from './editor'

let problemsExplorerView: vscode.TreeView<ProblemsItem>;
let caseView: vscode.TreeView<CaseNode>;

export function activate(context: vscode.ExtensionContext) {
	// ProblemsExplorer
	const problemsExplorerProvider = new ProblemsExplorerProvider();
	problemsExplorerView = vscode.window.createTreeView('problemsExplorer', { treeDataProvider: problemsExplorerProvider });
	context.subscriptions.push(vscode.window.registerTreeDataProvider('problemsExplorer', problemsExplorerProvider));
	context.subscriptions.push(vscode.commands.registerCommand('problemsExplorer.addProblem', () => {
		problemsExplorerProvider.onBtnAddProblemClicked();
	}));
	vscode.commands.registerCommand('problemsExplorer.addProblemFromFolder', () => { });
	context.subscriptions.push(vscode.commands.registerCommand('problemsExplorer.renameProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.onBtnRenameProblemClicked(element);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('problemsExplorer.deleteProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.onBtnDeleteProblemClicked(element);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('problemsExplorer.switchProblem', async (element: ProblemsItem) => {
		await saveCurrentCaseContent();
		caseViewProvider.switchCaseGroup(element.caseGroup);
		showCurrentCaseContent();
	}));

	// CaseView
	const caseViewProvider = new CaseViewProvider();
	caseView = vscode.window.createTreeView('caseView', { treeDataProvider: caseViewProvider });
	context.subscriptions.push(vscode.window.registerTreeDataProvider('caseView', caseViewProvider));
	context.subscriptions.push(vscode.commands.registerCommand('caseView.setting',()=>{
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bakabaka9405.mirai-vscode');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('caseView.addCase', () => {
		caseViewProvider.onBtnAddCaseClicked();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('caseView.deleteCase', (element: CaseNode) => {
		caseViewProvider.onBtnDeleteCaseClicked(element);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('caseView.renameCase', (element: CaseNode) => {
		caseViewProvider.onBtnRenameCaseClicked(element);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('caseView.testAllCase', async () => {
		await vscode.commands.executeCommand('workbench.action.files.save');
		await doTest(caseViewProvider.getChildren(), caseViewProvider, caseView);
		showCurrentCaseContent();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('caseView.testSingleCase', async (element: CaseNode) => {
		await vscode.commands.executeCommand('workbench.action.files.save');
		caseView.reveal(element);
		element.iconPath = undefined;
		caseViewProvider.refresh(element);
		await doSingleTest(element);
		caseViewProvider.refresh(element);
	}));

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

	context.subscriptions.push(vscode.commands.registerCommand('caseView.switchCase', async (element: CaseNode | undefined) => {
		await saveCurrentCaseContent();
		caseViewProvider.current_case = element;
		showCurrentCaseContent();
	}));

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

	context.subscriptions.push(vscode.commands.registerCommand('outputView.copyOutput', async () => {
		const content = await outputEditor.getText();
		await vscode.env.clipboard.writeText(content);
		vscode.window.showInformationMessage("已复制");
	}));

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

	context.subscriptions.push(vscode.commands.registerCommand('expectedOutputView.contrast', async () => {
		const os = require('os');
		let file1 = path.join(os.tmpdir(), 'contrast_lt.txt');
		let file2 = path.join(os.tmpdir(), 'contrast_rt.txt');

		const [output, expectedOutput] = await Promise.all([outputEditor.getText(), expectedOutputEditor.getText()]);

		fs.writeFileSync(file1, output);
		fs.writeFileSync(file2, expectedOutput);

		let uri1 = vscode.Uri.file(file1);
		let uri2 = vscode.Uri.file(file2);

		vscode.commands.executeCommand('vscode.diff', uri1, uri2, "输出↔期望输出");
	}));

	//load config
	let config = loadConfig();
	problemsExplorerProvider.problems = config.problems.map((problem: { label: string; cases: CaseGroup; }) => {
		let p = new ProblemsItem(problem.label, vscode.TreeItemCollapsibleState.None);
		p.caseGroup.data = Object.values(problem.cases).map((c) => {
			return new CaseNode(c.label, vscode.TreeItemCollapsibleState.None, undefined, c.input, "", c.expectedOutput);
		});
		return p;
	});

	//save config
	let timer = setInterval(() => {
		saveConfig(problemsExplorerProvider.problems);
	}, 5000);

	startListen(problemsExplorerProvider);
}

export function deactivate() {

}
