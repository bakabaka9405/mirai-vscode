import * as vscode from 'vscode';
import { CaseViewProvider, CaseNode, CaseGroup } from './caseView'
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer'
import { loadConfig, saveConfig } from './config'
export function activate(context: vscode.ExtensionContext) {
	// ProblemsExplorer
	const problemsExplorerProvider = new ProblemsExplorerProvider();
	vscode.window.registerTreeDataProvider('problemsExplorer', problemsExplorerProvider);
	vscode.commands.registerCommand('problemsExplorer.addProblem', () => {
		problemsExplorerProvider.addProblem();
	});
	vscode.commands.registerCommand('problemsExplorer.addProblemFromFolder', () => { });
	vscode.commands.registerCommand('problemsExplorer.renameProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.renameProblem(element);
	});
	vscode.commands.registerCommand('problemsExplorer.deleteProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.deleteProblem(element);
	});
	vscode.commands.registerCommand('problemsExplorer.switchProblem', async (element: ProblemsItem) => {
		await saveCurrentCaseContent();
		caseViewProvider.switchCaseGroup(element.caseGroup);
		showCurrentCaseContent();
	});

	// CaseView
	const caseViewProvider = new CaseViewProvider();
	vscode.window.registerTreeDataProvider('caseView', caseViewProvider);
	vscode.commands.registerCommand('caseView.addCase', () => {
		caseViewProvider.addCase();
	});
	vscode.commands.registerCommand('caseView.deleteCase', (element: CaseNode) => {
		caseViewProvider.deleteCase(element);
	});
	vscode.commands.registerCommand('caseView.renameCase', (element: CaseNode) => {
		caseViewProvider.renameCase(element);
	});

	function getTextFromWebview(view: vscode.WebviewView): Promise<string> {
		return new Promise((resolve) => {
			const listener = view.webview.onDidReceiveMessage(e => {
				if (e.command === 'response') {
					listener.dispose();
					resolve(e.data);
				}
			},
				undefined,
				context.subscriptions);
			view.webview.postMessage({ command: 'getText' });
		});
	}

	function setTextToWebview(view: vscode.WebviewView, content: string) {
		view.webview.postMessage({ command: 'setText', data: content });
	}

	vscode.commands.registerCommand('caseView.testAllCase', async () => {
		if (inputView && outputView) {
			const content = await getTextFromWebview(inputView);
			setTextToWebview(outputView, content);
			await saveCurrentCaseContent();
			saveConfig(problemsExplorerProvider.problems);
		}
	});

	async function saveCurrentCaseContent() {
		if (inputView && outputView && expectedOutputView && caseViewProvider.current_case) {
			const [inputContent, outputContent, expectedOutputContent] = await Promise.all([
				getTextFromWebview(inputView),
				getTextFromWebview(outputView),
				getTextFromWebview(expectedOutputView)
			]);
			if (caseViewProvider.current_case) {
				caseViewProvider.current_case.input = inputContent;
				caseViewProvider.current_case.output = outputContent;
				caseViewProvider.current_case.expectedOutput = expectedOutputContent;
			}
		}
	}

	function showCurrentCaseContent() {
		if (inputView && outputView && expectedOutputView) {
			if (caseViewProvider.current_case) {
				setTextToWebview(inputView, caseViewProvider.current_case.input);
				setTextToWebview(outputView, caseViewProvider.current_case.output);
				setTextToWebview(expectedOutputView, caseViewProvider.current_case.expectedOutput);
			}
			else {
				setTextToWebview(inputView, "");
				setTextToWebview(outputView, "");
				setTextToWebview(expectedOutputView, "");
			}
		}
	}

	vscode.commands.registerCommand('caseView.switchCase', async (element: CaseNode | undefined) => {
		await saveCurrentCaseContent();
		caseViewProvider.current_case = element;
		showCurrentCaseContent();
	});

	let inputView = undefined as vscode.WebviewView | undefined;
	vscode.window.registerWebviewViewProvider("inputView", {
		resolveWebviewView(webviewView) {
			inputView = webviewView;
			webviewView.webview.options = {
				enableScripts: true  // 启用脚本
			};

			webviewView.webview.html = /* html */`
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
					<style>
						html, body, #editor {
							width: 100%;
							height: 100%;
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}
					</style>
				</head>
				<body>
				<div id="editor"></div>
					<script>
						require.config({
							paths: {
								'vs': 'https://unpkg.com/monaco-editor/min/vs'
							}
						});
			
						require(['vs/editor/editor.main'], function() {
							var editor = monaco.editor.create(document.getElementById('editor'), {
								value: '',
								language: 'plaintext',
								lineNumbers: 'on',
								minimap:{enabled:false},
								hover:{enabled:false},
								automaticLayout: true,
								lineNumbersMinChars: 2,
								lineDecorationsWidth: 1,
								contextmenu: false,
								fontFamily:"'Jetbrains Mono Medium','Microsoft YaHei Mono', monospace",
								quickSuggestions: false
							});
							monaco.editor.defineTheme('myTheme', {
								base: 'vs-dark',  // 基于暗色主题
								inherit: true,  // 继承基主题的设置
								rules: [],  // 自定义的语法高亮规则
								colors: {
									'editor.background': '#24292e',
									'editorGutter.background': '#1f2428',
									'editor.lineHighlightBackground': '#2b3036'
								}
							});
							monaco.editor.setTheme('myTheme');
							const vscode = acquireVsCodeApi();
							window.addEventListener('message', event => {
								const message = event.data; // The JSON data our extension sent
							
								switch (message.command) {
									case 'getText':
										vscode.postMessage({command:'response',data:editor.getValue()});
										break;
									case 'setText':
										editor.setValue(message.data);
										break;
								}
							});
						});
					</script>
				</body>
				</html>
			`;
		}
	}, {
		webviewOptions: {
			retainContextWhenHidden: true
		},
	});

	let outputView = undefined as vscode.WebviewView | undefined;
	vscode.window.registerWebviewViewProvider("outputView", {
		resolveWebviewView(webviewView) {
			outputView = webviewView;
			webviewView.webview.options = {
				enableScripts: true  // 启用脚本
			};

			webviewView.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
					<style>
						html, body, #editor {
							width: 100%;
							height: 100%;
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}
					</style>
				</head>
				<body>
				<div id="editor"></div>
					<script>
						require.config({
							paths: {
								'vs': 'https://unpkg.com/monaco-editor/min/vs'
							}
						});
			
						require(['vs/editor/editor.main'], function() {
							var editor = monaco.editor.create(document.getElementById('editor'), {
								value: '',
								language: 'plaintext',
								lineNumbers: 'on',
								minimap:{enabled:false},
								readOnly:true,
								hover:{enabled:false},
								automaticLayout: true,
								lineNumbersMinChars: 2,
								lineDecorationsWidth: 1,
								contextmenu: false,
								fontFamily:"'Jetbrains Mono Medium','Microsoft YaHei Mono', monospace",
								quickSuggestions: false
							});
							monaco.editor.defineTheme('myTheme', {
								base: 'vs-dark',  // 基于暗色主题
								inherit: true,  // 继承基主题的设置
								rules: [],  // 自定义的语法高亮规则
								colors: {
									'editor.background': '#24292e',
									'editorGutter.background': '#1f2428',
									'editor.lineHighlightBackground': '#2b3036',
								}
							});
							const vscode = acquireVsCodeApi();
							monaco.editor.setTheme('myTheme');
							window.addEventListener('message', event => {
								const message = event.data; // The JSON data our extension sent
							
								switch (message.command) {
									case 'getText':
										vscode.postMessage({command:'response',data:editor.getValue()});
										break;
									case 'setText':
										editor.setValue(message.data);
										break;
								}
							});
						});
					</script>
				</body>
				</html>
			`;
		}
	}, {
		webviewOptions: {
			retainContextWhenHidden: true
		},
	});
	let expectedOutputView = undefined as vscode.WebviewView | undefined;
	vscode.window.registerWebviewViewProvider("expectedOutputView", {
		resolveWebviewView(webviewView) {
			expectedOutputView = webviewView;
			webviewView.webview.options = {
				enableScripts: true  // 启用脚本
			};

			webviewView.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
					<style>
						html, body, #editor {
							width: 100%;
							height: 100%;
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}
					</style>
				</head>
				<body>
				<div id="editor"></div>
					<script>
						require.config({
							paths: {
								'vs': 'https://unpkg.com/monaco-editor/min/vs'
							}
						});
			
						require(['vs/editor/editor.main'], function() {
							var editor = monaco.editor.create(document.getElementById('editor'), {
								value: '',
								language: 'plaintext',
								lineNumbers: 'on',
								minimap:{enabled:false},
								hover:{enabled:false},
								automaticLayout: true,
								lineNumbersMinChars: 2,
								lineDecorationsWidth: 1,
								contextmenu: false,
								fontFamily:"'Jetbrains Mono Medium','Microsoft YaHei Mono', monospace",
								quickSuggestions: false
							});
							monaco.editor.defineTheme('myTheme', {
								base: 'vs-dark',  // 基于暗色主题
								inherit: true,  // 继承基主题的设置
								rules: [],  // 自定义的语法高亮规则
								colors: {
									'editor.background': '#24292e',
									'editorGutter.background': '#1f2428',
									'editor.lineHighlightBackground': '#2b3036',
								}
							});
							const vscode = acquireVsCodeApi();
							monaco.editor.setTheme('myTheme');
							window.addEventListener('message', event => {
								const message = event.data; // The JSON data our extension sent
							
								switch (message.command) {
									case 'getText':
										vscode.postMessage({command:'response',data:editor.getValue()});
										break;
									case 'setText':
										editor.setValue(message.data);
										break;
								}
							});
						});
					</script>
				</body>
				</html>
			`;
		}
	}, {
		webviewOptions: {
			retainContextWhenHidden: true
		},
	});

	//load config
	let config = loadConfig();
	problemsExplorerProvider.problems = config.problems.map((problem: { label: string; cases: CaseGroup; }) => {
		let p = new ProblemsItem(problem.label, vscode.TreeItemCollapsibleState.None);
		p.caseGroup.data = Object.values(problem.cases).map((c) => {
			return new CaseNode(c.label, vscode.TreeItemCollapsibleState.None, undefined, c.input, c.output, c.expectedOutput);
		});
		return p;
	});
}

export function deactivate() {

}
