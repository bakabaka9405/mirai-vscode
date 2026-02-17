import * as vscode from 'vscode';

/**
 * Webview 编辑器 Provider - 用于输入/输出编辑
 */
export class EditorViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private pendingText?: string;

    private _onDidChange = new vscode.EventEmitter<string>();
    private _onLoad = new vscode.EventEmitter<void>();

    readonly onDidChange = this._onDidChange.event;
    readonly onLoad = this._onLoad.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly readOnly: boolean = false
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(e => {
            switch (e.command) {
                case 'textChanged':
                    this._onDidChange.fire(e.data);
                    break;
                case 'load':
                    this._onLoad.fire();
                    if (this.pendingText !== undefined) {
                        this.setText(this.pendingText);
                        this.pendingText = undefined;
                    }
                    break;
                case 'response':
                    // Handled by getText promise
                    break;
            }
        });
    }

    setText(text: string): void {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({ command: 'setText', data: text });
            this._onDidChange.fire(text);
        } else {
            this.pendingText = text;
        }
    }

    async getText(): Promise<string> {
        if (!this.webviewView) { return ''; }

        return new Promise(resolve => {
            const listener = this.webviewView!.webview.onDidReceiveMessage(e => {
                if (e.command === 'response') {
                    listener.dispose();
                    resolve(e.data);
                }
            });
            this.webviewView!.webview.postMessage({ command: 'getText' });
        });
    }

    reveal(): void {
        this.webviewView?.show(true);
    }

    updateTheme(): void {
        this.webviewView?.webview.postMessage({ command: 'themeChanged' });
    }

    private getHtml(webview: vscode.Webview): string {
        const loaderUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monaco', 'loader.js')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
        );
        const monacoBaseUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monaco')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
        );

        return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <script src="${loaderUri}"></script>
                <link href="${styleUri}" rel="stylesheet">
            </head>
            <body onload="notifyLoad()">
                <div id="editor"></div>
                <script>
                    const MonacoBaseUri = "${monacoBaseUri}";
                    const InitialReadOnly = "${this.readOnly}";
                </script>
                <script src="${scriptUri}"></script>
            </body>
        </html>`;
    }

    dispose(): void {
        this._onDidChange.dispose();
        this._onLoad.dispose();
    }
}
