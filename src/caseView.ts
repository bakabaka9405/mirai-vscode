import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
export class CaseViewProvider implements vscode.TreeDataProvider<CaseNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<CaseNode | undefined | void> = new vscode.EventEmitter<CaseNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<CaseNode | undefined | void> = this._onDidChangeTreeData.event;
	private cases: CaseList | undefined = undefined;
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

	public switchCaseGroup(element: CaseList) {
		this.cases = element;
		this.refresh();
	}

	public onBtnAddCaseClicked() {
		if (this.cases) {
			this.cases.push(new CaseNode("Case " + (this.cases.length + 1), vscode.TreeItemCollapsibleState.None));
			this.refresh();
		}
		else {
			vscode.window.showErrorMessage("当前未选中试题");
		}
	}

	public onBtnDeleteCaseClicked(element: CaseNode) {
		if (this.cases) {
			let index = this.cases.data.indexOf(element);
			if (index >= 0) {
				this.cases.data.splice(index, 1);
				this.refresh();
			}
		}
	}

	public async onBtnRenameCaseClicked(element: CaseNode) {
		let label = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.label
		});
		if (label) {
			element.setLabel(label);
			this.refresh();
		}
	}
	public async onBtnSearchCasesInFolderClicked() {
		if (!this.cases) {
			vscode.window.showErrorMessage("当前未选中试题");
			return;
		}
		let folders = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: true,

			openLabel: "选择文件夹"
		});
		if (folders) {
			let count = 0;
			for (let folder of folders) {
				let files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "*.in"));
				files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
				files.forEach((file) => {
					const inputPath = file.fsPath;
					const expectedOutputSuffix = [".ans", ".out", ".std"];
					for (let suffix of expectedOutputSuffix) {
						const expectedOutputPath = file.fsPath.replace(/\.in$/, suffix);
						if (fs.existsSync(expectedOutputPath)) {
							const input = fs.readFileSync(inputPath, 'utf-8');
							const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf-8');
							this.cases?.data.push(new CaseNode(path.basename(file.fsPath, '.in'), vscode.TreeItemCollapsibleState.None, undefined, input, "", expectedOutput));
							count += 1;
							break;
						}
					}
				});
			}
			vscode.window.showInformationMessage(`找到${count}个样例`);
			this.refresh();
		}
	}
}

export class CaseList {
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
	public toJSON() {
		return this.data.map(c => c.toJSON());
	}

	public fromJSON(json: any) {
		this.data = json.map((c: any) => {
			let caseNode = new CaseNode("", vscode.TreeItemCollapsibleState.None);
			caseNode.fromJSON(c);
			return caseNode;
		});
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

	toJSON() {
		return {
			label: this.label,
			input: this.input,
			output: this.output,
			expectedOutput: this.expectedOutput
		}
	}

	fromJSON(json: any) {
		this.label = json.label;
		this.input = json.input;
		this.output = json.output;
		this.expectedOutput = json.expectedOutput;
	}
}