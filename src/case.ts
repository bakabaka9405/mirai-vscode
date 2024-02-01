import * as vscode from 'vscode';

export class CaseViewProvider implements vscode.TreeDataProvider<CaseNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<CaseNode | undefined | void> = new vscode.EventEmitter<CaseNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<CaseNode | undefined | void> = this._onDidChangeTreeData.event;
	private cases: CaseNode[] = [];
	constructor() {
	}
	getTreeItem(element: CaseNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: CaseNode) {
		// TODO: Implement logic to fetch the child nodes
		return this.cases;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	public addCase() {
		this.cases.push(new CaseNode("Case " + (this.cases.length + 1), vscode.TreeItemCollapsibleState.None));
		this.refresh();
	}

	public deleteCase(element: CaseNode) {
		let index = this.cases.indexOf(element);
		if (index >= 0) {
			this.cases.splice(index, 1);
			this.refresh();
		}
	}

	public async renameCase(element: CaseNode) {
		let label = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.label
		});
		if (label) {
			element.setLabel(label);
			this.refresh();
		}
	}
}

export class CaseNode extends vscode.TreeItem {
	constructor(
		public label:string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}

	public setLabel(label: string) {
		this.label = label;
	}

	contextValue = "case";
}