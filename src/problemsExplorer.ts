import * as vscode from 'vscode'

export class ProblemsExplorerProvider implements vscode.TreeDataProvider<ProblemsItem>{
	private _onDidChangeTreeData: vscode.EventEmitter<ProblemsItem | undefined | void> = new vscode.EventEmitter<ProblemsItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProblemsItem | undefined | void> = this._onDidChangeTreeData.event;
	private problems: ProblemsItem[] = [];
	constructor() {
		//this.problems.push(new ProblemsItem("Problem 1", vscode.TreeItemCollapsibleState.None));
		//this.problems.push(new ProblemsItem("Problem 2", vscode.TreeItemCollapsibleState.None));
		//this.problems.push(new ProblemsItem("Problem 3", vscode.TreeItemCollapsibleState.None));
		//this.problems.push(new ProblemsItem("Problem 4", vscode.TreeItemCollapsibleState.None));
	}
	getTreeItem(element: ProblemsItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	getChildren(element?: ProblemsItem | undefined): vscode.ProviderResult<ProblemsItem[]> {
		return this.problems;
	}
	getParent?(element: ProblemsItem): vscode.ProviderResult<ProblemsItem> {
		return undefined;
	}

	public async renameItem(element: ProblemsItem) {
		const newName = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.label
		});
		if (newName) {
			element.setLabel(newName);
			this.refresh();
		}
	}

	private refresh() {
		this._onDidChangeTreeData?.fire();
	}

	public async addProblem(label?: string) {
		if (!label) {
			label = await vscode.window.showInputBox({
				placeHolder: "Problem name",
				value: "Problem "+(this.problems.length+1)
			});
		}
		if(!label)return;
		this.problems.push(new ProblemsItem(label, vscode.TreeItemCollapsibleState.None));
		this.refresh();
	}
}

export class ProblemsItem extends vscode.TreeItem {
	constructor(
		public label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}

	setLabel(newLabel: string) {
		this.label = newLabel;
	}
}