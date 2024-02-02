import * as vscode from 'vscode';

export class CaseViewProvider implements vscode.TreeDataProvider<CaseNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<CaseNode | undefined | void> = new vscode.EventEmitter<CaseNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<CaseNode | undefined | void> = this._onDidChangeTreeData.event;
	private cases: CaseGroup | undefined = undefined;
	public get current_case(): CaseNode | undefined {
		return this.cases?.current_case;
	}
	public set current_case(node: CaseNode | undefined) {
		if (this.cases) {
			this.cases.current_case = node;
		}
	}
	constructor() {
	}
	getTreeItem(element: CaseNode): vscode.TreeItem {
		return element;
	}
	getParent(element: CaseNode): vscode.ProviderResult<CaseNode> {
		return element.parent;
	}

	getChildren(element?: CaseNode) {
		if (this.cases) {
			return this.cases.data;
		}
		else return [];
	}

	refresh(element?: CaseNode): void {
		this._onDidChangeTreeData.fire(element);
	}

	public switchCaseGroup(element: CaseGroup) {
		this.cases = element;
		this.refresh();
	}

	public addCase() {
		if (this.cases) {
			this.cases.push(new CaseNode("Case " + (this.cases.length + 1), vscode.TreeItemCollapsibleState.None));
			this.refresh();
		}
		else {
			vscode.window.showErrorMessage("当前未选中试题");
		}
	}

	public deleteCase(element: CaseNode) {
		if (this.cases) {
			let index = this.cases.data.indexOf(element);
			if (index >= 0) {
				this.cases.data.splice(index, 1);
				this.refresh();
			}
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

export class CaseGroup {
	public data: CaseNode[] = []
	public current_case: CaseNode | undefined = undefined;
	public push(node: CaseNode) {
		this.data.push(node);
		if (!this.current_case) {
			this.current_case = node;
		}
	}
	public get length(): number {
		return this.data.length;
	}
}

export class CaseNode extends vscode.TreeItem {
	parent: vscode.ProviderResult<CaseNode>;
	constructor(
		public label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
		public input: string = "",
		public output: string = "",
		public expectedOutput: string = "",
	) {
		super(label, collapsibleState);

		this.command = {
			command: 'caseView.switchCase',
			title: '切换样例',
			arguments: [this]
		};
	}

	public setLabel(label: string) {
		this.label = label;
	}

	contextValue = "case";

}