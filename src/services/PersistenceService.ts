import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Problem } from '../core/models';
import { ConfigService } from './ConfigService';

/**
 * 持久化服务 - 管理试题数据的保存和加载
 */
export class PersistenceService {
    private static instance: PersistenceService;
    private config: ConfigService;
    private saveTimer?: NodeJS.Timeout;

    private constructor() {
        this.config = ConfigService.getInstance();
    }

    static getInstance(): PersistenceService {
        if (!PersistenceService.instance) {
            PersistenceService.instance = new PersistenceService();
        }
        return PersistenceService.instance;
    }

    private get configFilePath(): string | undefined {
        const workspace = this.config.workspacePath;
        if (!workspace) { return undefined; }
        return path.join(workspace, 'mirai_config.json');
    }

    load(): Problem {
        const filePath = this.configFilePath;
        if (!filePath || !fs.existsSync(filePath)) {
            return new Problem('', undefined, undefined, true);
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const config = JSON.parse(content);
            const root = Problem.fromJSON(config.problems || { folder: true, children: [] });
            root.folder = true;
            return root;
        } catch (error) {
            console.error('Failed to load problems:', error);
            return new Problem('', undefined, undefined, true);
        }
    }

    save(problemsRoot: Problem): void {
        const filePath = this.configFilePath;
        if (!filePath) { return; }

        try {
            const config = { problems: problemsRoot.toJSON() };
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Failed to save problems:', error);
        }
    }

    startAutoSave(problemsRoot: Problem, intervalMs: number = 5000): void {
        this.stopAutoSave();
        this.saveTimer = setInterval(() => {
            this.save(problemsRoot);
        }, intervalMs);
    }

    stopAutoSave(): void {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = undefined;
        }
    }

    dispose(): void {
        this.stopAutoSave();
    }
}
