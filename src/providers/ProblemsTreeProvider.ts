import * as vscode from 'vscode';
import { Problem } from '../core/models';

/**
 * 试题集树视图 Provider
 */
export class ProblemsTreeProvider implements 
    vscode.TreeDataProvider<ProblemTreeItem>,
    vscode.TreeDragAndDropController<ProblemTreeItem> 
{
    readonly dragMimeTypes = ['application/vnd.code.tree.problemsExplorer'];
    readonly dropMimeTypes = ['application/vnd.code.tree.problemsExplorer'];

    private _onDidChangeTreeData = new vscode.EventEmitter<ProblemTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _onProblemSelected = new vscode.EventEmitter<Problem>();
    readonly onProblemSelected = this._onProblemSelected.event;

    private itemMap = new WeakMap<Problem, ProblemTreeItem>();
    public root: Problem;

    constructor(root?: Problem) {
        this.root = root || new Problem('', undefined, undefined, true);
    }

    getTreeItem(element: ProblemTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProblemTreeItem): ProblemTreeItem[] {
        const problem = element?.problem || this.root;
        return problem.getChildren().map(child => this.getOrCreateItem(child));
    }

    getParent(element: ProblemTreeItem): ProblemTreeItem | undefined {
        const parent = element.problem.parent;
        return parent ? this.getOrCreateItem(parent) : undefined;
    }

    private getOrCreateItem(problem: Problem): ProblemTreeItem {
        let item = this.itemMap.get(problem);
        if (!item) {
            item = new ProblemTreeItem(problem, this._onProblemSelected);
            this.itemMap.set(problem, item);
        }
        return item;
    }

    refresh(element?: ProblemTreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }

    // 拖放支持
    handleDrag(source: readonly ProblemTreeItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set(
            'application/vnd.code.tree.problemsExplorer',
            new vscode.DataTransferItem(source.map(s => s.problem))
        );
    }

    async handleDrop(target: ProblemTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const targetProblem = target?.problem || this.root;
        if (!targetProblem.folder) { return; }

        const transferItem = dataTransfer.get('application/vnd.code.tree.problemsExplorer');
        if (!transferItem) { return; }

        const sources = transferItem.value as Problem[];
        for (const source of sources) {
            if (source === targetProblem || !source.parent) { continue; }
            source.parent.remove(source);
            targetProblem.push(source);
        }
        this.refresh();
    }

    // 操作方法
    async addProblem(parent?: Problem, name?: string): Promise<Problem | undefined> {
        const target = parent || this.root;
        if (!target.folder) { return; }

        if (!name) {
            name = await vscode.window.showInputBox({
                placeHolder: 'Problem name',
                value: `Problem ${target.children.length + 1}`
            });
        }
        if (!name) { return; }

        const problem = new Problem(name, target);
        target.push(problem);
        this.refresh();
        return problem;
    }

    async addFolder(parent?: Problem): Promise<Problem | undefined> {
        const target = parent || this.root;
        if (!target.folder) { return; }

        const name = await vscode.window.showInputBox({
            placeHolder: 'Folder name',
            value: 'New Folder'
        });
        if (!name) { return; }

        const folder = target.getFolderOrCreate(name);
        this.refresh();
        return folder;
    }

    async rename(problem: Problem): Promise<void> {
        const newName = await vscode.window.showInputBox({
            placeHolder: 'New name',
            value: problem.name
        });
        if (newName) {
            problem.name = newName;
            problem.parent?.sort();
            this.refresh();
        }
    }

    delete(problem: Problem): void {
        if (problem.parent?.remove(problem)) {
            this.refresh();
        }
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this._onProblemSelected.dispose();
    }
}

/**
 * 试题树节点
 */
export class ProblemTreeItem extends vscode.TreeItem {
    constructor(
        public readonly problem: Problem,
        private onSelect: vscode.EventEmitter<Problem>
    ) {
        super(
            problem.name,
            problem.folder
                ? (problem.collapsed 
                    ? vscode.TreeItemCollapsibleState.Collapsed 
                    : vscode.TreeItemCollapsibleState.Expanded)
                : vscode.TreeItemCollapsibleState.None
        );

        this.contextValue = problem.folder ? 'folder' : 'problem';

        if (!problem.folder) {
            this.command = {
                command: 'problemsExplorer.switchProblem',
                title: '切换试题',
                arguments: [this]
            };
        }
    }

    select(): void {
        this.onSelect.fire(this.problem);
    }
}
