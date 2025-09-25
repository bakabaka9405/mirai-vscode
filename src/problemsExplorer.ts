import * as vscode from 'vscode'
import { CaseList } from './caseView'

export class ProblemsExplorerProvider implements vscode.TreeDataProvider<ProblemsItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProblemsItem | undefined | void> = new vscode.EventEmitter<ProblemsItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProblemsItem | undefined | void> = this._onDidChangeTreeData.event;
	public problemsRoot: ProblemsItem = new ProblemsItem("", undefined, undefined, true, []);
	getTreeItem(element: ProblemsItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	getChildren(element?: ProblemsItem | undefined): vscode.ProviderResult<ProblemsItem[]> {
		if (element) {
			return element.getChildren();
		}
		return this.problemsRoot.children || [];
	}
	getParent?(element: ProblemsItem): vscode.ProviderResult<ProblemsItem> {
		return element.parent;
	}


	public async onBtnRenameProblemOrFolderClicked(element: ProblemsItem) {
		const newName = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.label
		});
		if (newName) {
			element.setLabel(newName);
			element.parent?.sort();
			this.refresh();
		}
	}

	public refresh() {
		this._onDidChangeTreeData?.fire();
	}

	public async onBtnAddProblemClicked(element: ProblemsItem, label?: string) {
		if (!element.folder) return;
		if (!element.children) element.children = [];
		if (!label) {
			label = await vscode.window.showInputBox({
				placeHolder: "Problem name",
				value: "Problem " + (element.children.length + 1)
			});
		}
		if (!label) return;
		element.push(new ProblemsItem(label, element));
		this.refresh();
	}

	public async onBtnAddFolderClicked(element: ProblemsItem) {
		if (!element.folder) return;
		if (!element.children) element.children = [];
		const folderName = await vscode.window.showInputBox({
			placeHolder: "Folder name",
			value: "New Folder"
		});
		if (!folderName) return;
		element.getFolderOrCreate(folderName);
		this.refresh();
	}

	public onBtnDeleteProblemClicked(element: ProblemsItem) {
		if (element.parent && element.parent.children) {
			let index = element.parent.children.indexOf(element);
			if (index >= 0) {
				element.parent.children.splice(index, 1);
				this.refresh();
			}
		}
	}
}


export class ProblemsItem extends vscode.TreeItem {
	constructor(
		public label: string,
		public parent?: ProblemsItem,
		public url?: string,
		public folder: boolean = false,
		public children?: ProblemsItem[],
		public collapsed: boolean = false
	) {
		super(label, folder ? (collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded) : vscode.TreeItemCollapsibleState.None);
		if (!folder) {
			this.command = {
				command: 'problemsExplorer.switchProblem',
				title: '切换试题',
				arguments: [this]
			};
			this.cases = new CaseList();
			this.contextValue = "problem";
		}
		else {
			this.contextValue = "folder";
		}
	}

	public cases?: CaseList;

	GetPath(): string {
		if (!this.parent) return "";
		// console.log('label=', this.parent.GetPath() + "/" + this.label.replace(/[\/:*?"<>|]/g, ""))
		return this.parent.GetPath() + "/" + this.label.replace(/[\/:*?"<>|]/g, "");
	}

	setLabel(newLabel: string) {
		this.label = newLabel;
	}

	getChildren(): ProblemsItem[] {
		return this.children || [];
	}

	toJSON(): any {
		return {
			label: this.label,
			url: this.url,
			folder: this.folder,
			collapsed: this.collapsed,
			children: this.children?.map(c => c.toJSON()),
			cases: this.cases?.data.map(c => c.toJSON())
		}
	}

	static fromJSON(json: any) {
		return new ProblemsItem(
			json.label,
			undefined,
			json.url,
			json.folder,
			json.children?.map((c: any) => ProblemsItem.fromJSON(c)),
			json.collapsed
		);
	}

	getFolderOrCreate(folderName: string): ProblemsItem {
		if (!this.children) this.children = [];
		let folder = this.children.find(c => c.folder && c.label === folderName);
		if (!folder) {
			folder = new ProblemsItem(folderName, this, undefined, true);
			this.push(folder);
		}
		return folder;
	}

	isLessThan(other: ProblemsItem): boolean {
		if (this.folder && !other.folder) return true;
		if (!this.folder && other.folder) return false;
		return (this.label < other.label);
	}

	push(item: ProblemsItem) {
		if (!this.folder) return;
		if (!this.children) this.children = [];
		item.parent = this;
		this.children.push(item);
		this.sort();
	}

	sort() {
		if (!this.children) return;
		this.children.sort((a, b) => {
			if (a.isLessThan(b)) return -1;
			if (b.isLessThan(a)) return 1;
			return 0;
		});
	}


}