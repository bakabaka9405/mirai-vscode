import * as vscode from 'vscode'
import { CaseGroup } from './caseView'

export class ProblemsExplorerProvider implements vscode.TreeDataProvider<ProblemsItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProblemsItem | undefined | void> = new vscode.EventEmitter<ProblemsItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProblemsItem | undefined | void> = this._onDidChangeTreeData.event;
	public problems: ProblemsItem[] = [];
	getTreeItem(element: ProblemsItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	getChildren(element?: ProblemsItem | undefined): vscode.ProviderResult<ProblemsItem[]> {
		return this.problems;
	}
	getParent?(element: ProblemsItem): vscode.ProviderResult<ProblemsItem> {
		return undefined;
	}

	public async renameProblem(element: ProblemsItem) {
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
				value: "Problem " + (this.problems.length + 1)
			});
		}
		if (!label) return;
		this.problems.push(new ProblemsItem(label, vscode.TreeItemCollapsibleState.None));
		this.refresh();
	}

	public deleteProblem(element: ProblemsItem) {
		let index = this.problems.indexOf(element);
		if (index >= 0) {
			this.problems.splice(index, 1);
			this.refresh();
		}
		else console.log("Problem not found")
	}
}

export class ProblemsItem extends vscode.TreeItem {
	constructor(
		public label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command,
	) {
		super(label, collapsibleState);

		this.command = {
			command: 'problemsExplorer.switchProblem',
			title: '切换试题',
			arguments: [this]
		};
	}

	public caseGroup: CaseGroup = new CaseGroup();

	setLabel(newLabel: string) {
		this.label = newLabel;
	}

	contextValue = "problem"
}