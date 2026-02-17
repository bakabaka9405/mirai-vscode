import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import { LanguagePreset } from '../core/models';
import { ICustomLanguageConfig } from '../core/handlers';

/**
 * 配置服务 - 管理扩展配置和语言预设
 */
export class ConfigService {
    private static instance: ConfigService;
    private config: vscode.WorkspaceConfiguration;
    private _presets: LanguagePreset[] = [];
    private _customLanguages: ICustomLanguageConfig[] = [];

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

    /**
     * 获取所有语言预设
     */
    get presets(): LanguagePreset[] {
        return this._presets;
    }

    /**
     * 向后兼容：获取测试预设（别名）
     * @deprecated 使用 presets 代替
     */
    get testPresets(): LanguagePreset[] {
        return this._presets;
    }

    /**
     * 获取自定义语言配置
     */
    get customLanguages(): ICustomLanguageConfig[] {
        return this._customLanguages;
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

    /**
     * 刷新预设配置
     */
    private refreshPresets(): void {
        // 加载旧版 test_presets（向后兼容）
        const legacyPresets = this.config.get<any[]>('test_presets') || [];
        
        // 加载新版 language_presets
        const languagePresets = this.config.get<any[]>('language_presets') || [];

        // 加载自定义语言配置
        this._customLanguages = this.config.get<ICustomLanguageConfig[]>('custom_languages') || [];

        // 转换旧版预设（默认 C++）
        const convertedLegacy = legacyPresets.map(obj => {
            const preset = LanguagePreset.fromObject({
                ...obj,
                languageId: obj.languageId || 'cpp'
            });
            preset.additionalIncludePaths = (preset.additionalIncludePaths || []).map(p => 
                this.getAbsolutePath(p)
            );
            return preset;
        });

        // 转换新版预设
        const convertedNew = languagePresets.map(obj => {
            const preset = LanguagePreset.fromObject(obj);
            if (preset.additionalIncludePaths) {
                preset.additionalIncludePaths = preset.additionalIncludePaths.map(p => 
                    this.getAbsolutePath(p)
                );
            }
            return preset;
        });

        this._presets = [...convertedLegacy, ...convertedNew];

        // 自动搜索编译器
        if (this.config.get<boolean>('auto_search_compiler')) {
            this.searchCompilers();
        }
    }

    /**
     * 自动搜索编译器
     */
    private searchCompilers(): void {
        // C++ 编译器
        const cppCompilers = ['g++', 'clang++'];
        for (const compiler of cppCompilers) {
            const paths = this.getAllExecutable(compiler);
            for (const p of paths) {
                const version = this.getCompilerVersion(p);
                if (version) {
                    this._presets.push(LanguagePreset.fromObject({
                        label: `${compiler} ${version}`,
                        languageId: 'cpp',
                        compilerPath: p,
                        description: p
                    }));
                }
            }
        }

        // C 编译器
        const cCompilers = ['gcc', 'clang'];
        for (const compiler of cCompilers) {
            const paths = this.getAllExecutable(compiler);
            for (const p of paths) {
                const version = this.getCompilerVersion(p);
                if (version) {
                    this._presets.push(LanguagePreset.fromObject({
                        label: `${compiler} ${version}`,
                        languageId: 'c',
                        compilerPath: p,
                        description: p
                    }));
                }
            }
        }

        // Python 解释器
        const pythonInterpreters = ['python', 'python3'];
        for (const interpreter of pythonInterpreters) {
            const paths = this.getAllExecutable(interpreter);
            for (const p of paths) {
                const version = this.getPythonVersion(p);
                if (version) {
                    this._presets.push(LanguagePreset.fromObject({
                        label: `Python ${version}`,
                        languageId: 'python',
                        interpreterPath: p,
                        description: p
                    }));
                }
            }
        }

        // Java
        const javacPaths = this.getAllExecutable('javac');
        for (const p of javacPaths) {
            const version = this.getJavaVersion(p);
            if (version) {
                // 找到对应的 java 命令
                const javaPath = p.replace(/javac(\.exe)?$/, 'java$1');
                this._presets.push(LanguagePreset.fromObject({
                    label: `Java ${version}`,
                    languageId: 'java',
                    compilerPath: p,
                    runtimePath: javaPath,
                    description: p
                }));
            }
        }

        // Rust
        const rustcPaths = this.getAllExecutable('rustc');
        for (const p of rustcPaths) {
            const version = this.getRustVersion(p);
            if (version) {
                this._presets.push(LanguagePreset.fromObject({
                    label: `Rust ${version}`,
                    languageId: 'rust',
                    compilerPath: p,
                    description: p
                }));
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

    private getPythonVersion(pythonPath: string): string | null {
        try {
            const output = execSync(`"${pythonPath}" --version`, { encoding: 'utf-8' });
            const match = output.match(/Python\s+(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    private getJavaVersion(javacPath: string): string | null {
        try {
            const output = execSync(`"${javacPath}" -version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            const match = output.match(/javac\s+(\d+[\d.]*)/);
            return match ? match[1] : null;
        } catch (e: any) {
            // javac -version 输出到 stderr
            if (e.stderr) {
                const match = e.stderr.toString().match(/javac\s+(\d+[\d.]*)/);
                return match ? match[1] : null;
            }
            return null;
        }
    }

    private getRustVersion(rustcPath: string): string | null {
        try {
            const output = execSync(`"${rustcPath}" --version`, { encoding: 'utf-8' });
            const match = output.match(/rustc\s+(\d+\.\d+\.\d+)/);
            return match ? match[1] : null;
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

    /**
     * 根据语言 ID 过滤预设
     */
    getPresetsByLanguage(languageId: string): LanguagePreset[] {
        return this._presets.filter(p => p.languageId === languageId);
    }

    /**
     * 根据文件扩展名获取匹配的预设
     */
    getPresetsForFile(filePath: string): LanguagePreset[] {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        const languageMap: Record<string, string> = {
            'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'c++': 'cpp',
            'c': 'c', 'h': 'c',
            'py': 'python', 'pyw': 'python',
            'java': 'java',
            'rs': 'rust'
        };
        const languageId = languageMap[ext];
        if (!languageId) {
            return this._presets;
        }
        return this._presets.filter(p => p.languageId === languageId);
    }

    dispose(): void {
        this._onDidChange.dispose();
    }
}
