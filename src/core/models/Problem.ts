import { TestCase } from './TestCase';

/**
 * 试题数据模型
 * 与 VS Code API 解耦的纯数据类
 */
export interface IProblem {
    name: string;
    url?: string;
    folder: boolean;
    collapsed: boolean;
    children?: IProblem[];
    cases?: TestCase[];
}

export class Problem implements IProblem {
    public cases: TestCase[] = [];
    public children: Problem[] = [];

    constructor(
        public name: string,
        public parent?: Problem,
        public url?: string,
        public folder: boolean = false,
        public collapsed: boolean = false
    ) {
        if (!folder) {
            this.cases = [];
        }
    }

    getPath(): string {
        if (!this.parent) { return ''; }
        const safeName = this.name.replace(/[\/:*?"<>|]/g, '');
        return this.parent.getPath() + '/' + safeName;
    }

    getChildren(): Problem[] {
        return this.children;
    }

    push(item: Problem): void {
        if (!this.folder) { return; }
        item.parent = this;
        this.children.push(item);
        this.sort();
    }

    remove(item: Problem): boolean {
        const index = this.children.indexOf(item);
        if (index >= 0) {
            this.children.splice(index, 1);
            return true;
        }
        return false;
    }

    sort(): void {
        this.children.sort((a, b) => {
            if (a.folder && !b.folder) { return -1; }
            if (!a.folder && b.folder) { return 1; }
            return a.name.localeCompare(b.name);
        });
    }

    getFolderOrCreate(folderName: string): Problem {
        let folder = this.children.find(c => c.folder && c.name === folderName);
        if (!folder) {
            folder = new Problem(folderName, this, undefined, true);
            this.push(folder);
        }
        return folder;
    }

    toJSON(): object {
        return {
            label: this.name,
            url: this.url,
            folder: this.folder,
            collapsed: this.collapsed,
            children: this.children.map(c => c.toJSON()),
            cases: this.cases.map(c => c.toJSON())
        };
    }

    static fromJSON(json: any, parent?: Problem): Problem {
        const item = new Problem(
            json.label || '',
            parent,
            json.url,
            json.folder ?? false,
            json.collapsed ?? false
        );

        if (json.children) {
            item.children = json.children.map((c: any) => Problem.fromJSON(c, item));
        }

        if (json.cases) {
            item.cases = json.cases.map((c: any) => TestCase.fromJSON(c));
        }

        return item;
    }
}
