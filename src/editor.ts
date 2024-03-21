import * as vscode from 'vscode'

export class Editor implements vscode.WebviewViewProvider {
	private webviewView: vscode.WebviewView | undefined;
	private _onDidChange = new vscode.EventEmitter<string>();
	private _onLoad = new vscode.EventEmitter<void>();
	private _readOnly: boolean;
	public readonly onDidChange = this._onDidChange.event;
	public readonly onLoad = this._onLoad.event;

	constructor(private readonly context: vscode.ExtensionContext, readonly: boolean = false) {
		this._readOnly = readonly;
	}

	public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
		this.webviewView = webviewView;
		this.webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
		};
		this.webviewView.webview.html = this.getHtmlForWebview(this.webviewView.webview);
		this.webviewView.webview.onDidReceiveMessage((e: { command: string, data: string }) => {
			if (e.command === 'textChanged') {
				this._onDidChange.fire(e.data);
			}
		});
		const load_listener = this.webviewView.webview.onDidReceiveMessage((e: { command: string, data: string }) => {
			if (e.command === 'load') {
				if (this._readOnly) {
					this.webviewView?.webview.postMessage({ command: 'setReadOnly', data: "true" });
				}
				this._onLoad.fire();
				load_listener.dispose();
			}
		});
	}

	public setText(text: string) {
		this.webviewView?.webview.postMessage({ command: 'setText', data: text });
		this._onDidChange.fire(text);
	}

	public getText(): string | Promise<string> {
		if (!this.webviewView) return "";
		else return new Promise((resolve) => {
			const listener = this.webviewView!.webview.onDidReceiveMessage((e: { command: string, data: string }) => {
				if (e.command === 'response') {
					listener.dispose();
					resolve(e.data);
				}
			},
				undefined,
				this.context.subscriptions);
			this.webviewView!.webview.postMessage({ command: 'getText' });
		});
	}



	private getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css'));
		return `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
				<link href="${styleUri}" rel="stylesheet">
			</head>
			<body onload="notifyLoad()">
				<div id="editor"></div>
				<script src="${scriptUri}"></script>
			</body>
		</html>`;
	}

	public reveal(){
		this.webviewView?.show(true);
	}
}