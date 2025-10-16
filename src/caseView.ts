import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig } from './config';
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
		let name = await vscode.window.showInputBox({
			placeHolder: "New name",
			value: element.name
		});
		if (name) {
			element.setLabel(name);
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
					const externalLengthLimit = getConfig<number>("external_case_length_limit") || 1048576;
					for (let suffix of expectedOutputSuffix) {
						const expectedOutputPath = file.fsPath.replace(/\.in$/, suffix);
						if (fs.existsSync(expectedOutputPath)) {
							const input = fs.readFileSync(inputPath, 'utf-8');
							const expectedOutput = fs.readFileSync(expectedOutputPath, 'utf-8');
							if (input.length + expectedOutput.length > externalLengthLimit) {
								this.cases?.data.push(new CaseNode(path.basename(file.fsPath, '.in'),
									vscode.TreeItemCollapsibleState.None,
									true, true, inputPath, "", expectedOutputPath));
							}
							else {
								this.cases?.data.push(new CaseNode(path.basename(file.fsPath, '.in'),
									vscode.TreeItemCollapsibleState.None,
									true, false, input, "", expectedOutput));
							}
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
	private _input: string = "";
	public output: string = "";
	private _expectedOutput: string = "";
	constructor(
		public name: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public enabled: boolean = true,
		public external: boolean = false,
		input: string = "",
		output: string = "",
		expectedOutput: string = ""
	) {
		super("", collapsibleState);

		this._input = input;
		this.output = output;
		this._expectedOutput = expectedOutput;
		this.checkboxState = enabled ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;

		this.command = {
			command: 'caseView.switchCase',
			title: '切换样例',
			arguments: [this]
		};

		this.setLabel(name);
	}

	public get input(): string {
		if (!this.external) return this._input;
		return fs.readFileSync(this._input, 'utf-8');
	}

	public set input(input: string) {
		if (!this.external) this._input = input;
		else if (fs.existsSync(this._input)) fs.writeFileSync(this._input, input, 'utf-8');
	}

	public get expectedOutput(): string {
		if (!this.external) return this._expectedOutput;
		return fs.readFileSync(this._expectedOutput, 'utf-8');
	}

	public set expectedOutput(expectedOutput: string) {
		if (!this.external) this._expectedOutput = expectedOutput;
		else if (fs.existsSync(this._expectedOutput)) fs.writeFileSync(this._expectedOutput, expectedOutput, 'utf-8');
	}

	public setLabel(name: string) {
		this.name = name;
		if (this.external) {
			this.label = {
				label: "(external) " + name,
				highlights: [[0, 10]]
			};
		}
		else {
			this.label = name;
		}
	}

	contextValue = "case";

	toJSON() {
		return {
			name: this.name,
			enabled: this.enabled,
			external: this.external,
			input: this._input,
			expectedOutput: this._expectedOutput
		}
	}

	fromJSON(json: any) {
		this.external = json.external || false;
		this.enabled = json.enabled || false;
		this._input = json.input || "";
		this.output = "";
		this._expectedOutput = json.expectedOutput || "";
		this.setLabel(json.name || "undefined");
		this.checkboxState = this.enabled ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
	}
}