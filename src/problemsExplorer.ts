import * as vscode from 'vscode'
import { CaseGroup } from './caseView'

export enum ProblemsGroupingMethod {
	None = `None`,
	Group = 'Group',
}

export class ProblemsExplorerProvider implements vscode.TreeDataProvider<ProblemsItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProblemsItem | undefined | void> = new vscode.EventEmitter<ProblemsItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProblemsItem | undefined | void> = this._onDidChangeTreeData.event;
	public problems: ProblemsItem[] = [];
	private groupingCache: ProblemsItem[] = [];
	private problemsChanged: boolean = false;
	public groupingMethod: ProblemsGroupingMethod = ProblemsGroupingMethod.None;
	getTreeItem(element: ProblemsItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	getChildren(element?: ProblemsItem | undefined): vscode.ProviderResult<ProblemsItem[]> {
		if (element) {
			return element.getChildren();
		}
		if (this.groupingMethod == ProblemsGroupingMethod.None) {
			return this.problems;
		}
		else {
			if (this.problemsChanged) {
				let groups: Map<string, ProblemsItem[]> = new Map();
				for (let problem of this.problems) {
					if (!groups.has(problem.group || "其他")) {
						groups.set(problem.group || "其他", []);
					}
					groups.get(problem.group || "其他")?.push(problem);
				}
				this.groupingCache = [];
				groups.forEach((value, key) => {
					this.groupingCache.push(new ProblemsItem(key, undefined, undefined, value));
				});
				this.problemsChanged = false;
			}
			return this.groupingCache;
		}
	}
	getParent?(element: ProblemsItem): vscode.ProviderResult<ProblemsItem> {
		return undefined;
	}


	public async onBtnRenameProblemClicked(element: ProblemsItem) {
		const newName = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.label
		});
		if (newName) {
			element.setLabel(newName);
			this.refresh();
		}
	}

	public refresh() {
		this.problemsChanged = true;
		this._onDidChangeTreeData?.fire();
	}

	public async onBtnAddProblemClicked(label?: string) {
		if (!label) {
			label = await vscode.window.showInputBox({
				placeHolder: "Problem name",
				value: "Problem " + (this.problems.length + 1)
			});
		}
		if (!label) return;
		this.problems.push(new ProblemsItem(label));
		this.refresh();
	}

	public onBtnDeleteProblemClicked(element: ProblemsItem) {
		if (element.children) {
			for (let child of element.children) {
				let index = this.problems.indexOf(child);
				if (index >= 0) {
					this.problems.splice(index, 1);
				}
			}
			this.refresh();
		}
		else {
			let index = this.problems.indexOf(element);
			if (index >= 0) {
				this.problems.splice(index, 1);
				this.refresh();
			}
			else console.log("Problem not found")
		}
	}

	public onBtnSwitchGroupingMethodClicked() {
		if (this.groupingMethod == ProblemsGroupingMethod.None) {
			this.groupingMethod = ProblemsGroupingMethod.Group;
		}
		else {
			this.groupingMethod = ProblemsGroupingMethod.None;
		}
		this.refresh();
	}
}


export class ProblemsItem extends vscode.TreeItem {
	constructor(
		public label: string,
		public group?: string,
		public url?: string,
		public children?: ProblemsItem[]
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		if (!children) {
			this.command = {
				command: 'problemsExplorer.switchProblem',
				title: '切换试题',
				arguments: [this]
			};
			this.caseGroup = new CaseGroup();
			this.contextValue = "problem";
		}
		else {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
			this.contextValue = "problemsGroup";
		}
	}

	public caseGroup?: CaseGroup;

	setLabel(newLabel: string) {
		this.label = newLabel;
		if (this.children) {
			for (let child of this.children) {
				child.group = newLabel;
			}
		}
	}

	getChildren(): ProblemsItem[] {
		return this.children || [];
	}
}