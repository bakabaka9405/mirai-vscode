import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import { TestPreset } from '../core/models';

/**
 * 配置服务 - 管理扩展配置和编译预设
 */
export class ConfigService {
    private static instance: ConfigService;
    private config: vscode.WorkspaceConfiguration;
    private _testPresets: TestPreset[] = [];

    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private constructor() {
        this.config = vscode.workspace.getConfiguration('mirai-vscode');
        this.refreshPresets();

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('mirai-vscode')) {
                this.config = vscode.workspace.getConfiguration('mirai-vscode');
                this.refreshPresets();
                this._onDidChange.fire();
            }
        });
    }

    static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    get<T>(section: string): T | undefined {
        return this.config.get<T>(section);
    }

    get testPresets(): TestPreset[] {
        return this._testPresets;
    }

    get workspacePath(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    }

    get srcBasePath(): string {
        const workspace = this.workspacePath;
        if (!workspace) { return ''; }
        return path.join(workspace, this.get<string>('src_base_dir') || '');
    }

    get buildBasePath(): string {
        const workspace = this.workspacePath;
        if (!workspace) { return ''; }
        return path.join(workspace, this.get<string>('build_base_dir') || '');
    }

    private refreshPresets(): void {
        const presetConfigs = this.config.get<any[]>('test_presets') || [];
        this._testPresets = presetConfigs.map(obj => {
            const preset = TestPreset.fromObject(obj);
            preset.additionalIncludePaths = preset.additionalIncludePaths.map(p => 
                this.getAbsolutePath(p)
            );
            return preset;
        });

        if (this.config.get<boolean>('auto_search_compiler')) {
            this.searchCompilers();
        }
    }

    private searchCompilers(): void {
        const compilers = ['g++', 'clang++'];
        for (const compiler of compilers) {
            const paths = this.getAllExecutable(compiler);
            for (const p of paths) {
                const version = this.getCompilerVersion(p);
                if (version) {
                    this._testPresets.push(new TestPreset(
                        `${compiler} ${version}`,
                        p,
                        p
                    ));
                }
            }
        }
    }

    private getCompilerVersion(compilerPath: string): string | null {
        try {
            const output = execSync(`"${compilerPath}" -dumpversion`, { encoding: 'utf-8' });
            return output.trim();
        } catch {
            return null;
        }
    }

    private getAllExecutable(name: string): string[] {
        const fs = require('fs');
        const paths = process.env.PATH?.split(path.delimiter) || [];
        const results: string[] = [];
        
        if (process.platform === 'win32' && !name.endsWith('.exe')) {
            name += '.exe';
        }
        
        for (const p of paths) {
            const fullPath = path.join(p, name);
            if (fs.existsSync(fullPath)) {
                results.push(fullPath);
            }
        }
        return results;
    }

    private getAbsolutePath(p: string): string {
        if (path.isAbsolute(p)) { return p; }
        const workspace = this.workspacePath;
        if (!workspace) { return p; }
        return path.join(workspace, p);
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
