import * as vscode from 'vscode';
import { TestCase, TestStatus } from '../core/models';

const ICONS: Partial<Record<TestStatus, string>> = {
    [TestStatus.Accepted]: 'check.svg',
    [TestStatus.WrongAnswer]: 'error.svg',
    [TestStatus.RuntimeError]: 'bug.svg',
    [TestStatus.TimeLimitExceeded]: 'clock.svg',
    [TestStatus.MemoryLimitExceeded]: 'memory.svg'
};

/**
 * 测试样例树视图 Provider
 */
export class CaseTreeProvider implements vscode.TreeDataProvider<CaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CaseTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _onCaseSelected = new vscode.EventEmitter<TestCase | undefined>();
    readonly onCaseSelected = this._onCaseSelected.event;

    private cases: TestCase[] = [];
    private currentCase?: TestCase;
    private itemMap = new WeakMap<TestCase, CaseTreeItem>();

    constructor(private readonly extensionUri: vscode.Uri) { }

    get current(): TestCase | undefined {
        return this.currentCase;
    }

    set current(testCase: TestCase | undefined) {
        this.currentCase = testCase;
        this._onCaseSelected.fire(testCase);
    }

    get allCases(): TestCase[] {
        return this.cases;
    }

    getTreeItem(element: CaseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): CaseTreeItem[] {
        return this.cases.map(c => this.getOrCreateItem(c));
    }

    getParent(): undefined {
        return undefined;
    }

    private getOrCreateItem(testCase: TestCase): CaseTreeItem {
        let item = this.itemMap.get(testCase);
        if (!item) {
            item = new CaseTreeItem(testCase, this.extensionUri);
            this.itemMap.set(testCase, item);
        } else {
            item.update();
        }
        return item;
    }

    switchCases(cases: TestCase[]): void {
        this.cases = cases;
        this.currentCase = cases.length > 0 ? cases[0] : undefined;
        this.itemMap = new WeakMap();
        this.refresh();
        this._onCaseSelected.fire(this.currentCase);
    }

    refresh(element?: CaseTreeItem): void {
        if (element) {
            element.update();
        }
        this._onDidChangeTreeData.fire(element);
    }

    addCase(): TestCase | undefined {
        const testCase = new TestCase(`Case ${this.cases.length + 1}`);
        this.cases.push(testCase);
        if (!this.currentCase) {
            this.currentCase = testCase;
        }
        this.refresh();
        return testCase;
    }

    deleteCase(testCase: TestCase): void {
        const index = this.cases.indexOf(testCase);
        if (index >= 0) {
            this.cases.splice(index, 1);
            if (this.currentCase === testCase) {
                this.currentCase = this.cases.length > 0 ? this.cases[0] : undefined;
                this._onCaseSelected.fire(this.currentCase);
            }
            this.refresh();
        }
    }

    async renameCase(testCase: TestCase): Promise<void> {
        const name = await vscode.window.showInputBox({
            placeHolder: 'New name',
            value: testCase.name
        });
        if (name) {
            testCase.name = name;
            this.refresh();
        }
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this._onCaseSelected.dispose();
    }
}

/**
 * 测试样例树节点
 */
export class CaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly testCase: TestCase,
        private readonly extensionUri: vscode.Uri
    ) {
        super('', vscode.TreeItemCollapsibleState.None);
        this.update();
        this.contextValue = 'case';
        this.command = {
            command: 'caseView.switchCase',
            title: '切换样例',
            arguments: [this.testCase]
        };
    }

    update(): void {
        if (this.testCase.external) {
            this.label = {
                label: `(external) ${this.testCase.name}`,
                highlights: [[0, 10]]
            };
        } else {
            this.label = this.testCase.name;
        }

        this.checkboxState = this.testCase.enabled
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;

        // 更新图标和描述
        const result = this.testCase.result;
        if (result) {
            const iconFile = ICONS[result.status];
            if (iconFile) {
                const iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', iconFile);
                this.iconPath = { light: iconPath, dark: iconPath };
            } else {
                this.iconPath = undefined;
            }

            if (result.time !== undefined) {
                this.description = `${result.time.toFixed(0)} ms`;
            }
        } else {
            this.iconPath = undefined;
            this.description = '';
        }
    }
}
