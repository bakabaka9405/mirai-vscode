import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LanguagePreset } from '../models';
import { ILspConfigGenerator } from './ILspConfigGenerator';
import { ConfigService } from '../../services/ConfigService';

/**
 * LSP 配置管理器
 * 
 * 统一管理各语言的 LSP 配置文件生成
 */
export class LspConfigManager {
    private generators = new Map<string, ILspConfigGenerator>();
    private config: ConfigService;

    constructor() {
        this.config = ConfigService.getInstance();
    }

    /**
     * 注册配置生成器
     */
    registerGenerator(generator: ILspConfigGenerator): void {
        this.generators.set(generator.languageId, generator);
    }

    /**
     * 获取配置生成器
     */
    getGenerator(languageId: string): ILspConfigGenerator | undefined {
        return this.generators.get(languageId);
    }

    /**
     * 统一接口：更新所有启用的 LSP 配置
     * 
     * @param preset 当前语言预设
     * @param srcBasePath 源文件基目录
     * @param buildBasePath 构建输出目录
     */
    async updateAllConfigs(
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<void> {
        const workspace = this.config.workspacePath;
        if (!workspace) { return; }

        // 获取输出目录（优先使用新配置项，向后兼容旧配置项）
        const outputDir = path.join(
            workspace,
            this.config.get<string>('lsp_config_path') 
                || this.config.get<string>('compile_commands_path') 
                || '.vscode'
        );
        fs.mkdirSync(outputDir, { recursive: true });

        // 扫描所有源文件
        const filesByLanguage = this.scanSourceFiles(srcBasePath);

        // 遍历所有生成器
        for (const generator of this.generators.values()) {
            // 检查该语言的配置是否启用
            if (!this.config.get<boolean>(generator.settingKey)) {
                continue;
            }

            const files = filesByLanguage.get(generator.languageId) || [];
            if (files.length === 0) { continue; }

            const result = await generator.generate(files, preset, srcBasePath, buildBasePath);

            if (result.warning) {
                vscode.window.showWarningMessage(result.warning);
            }

            if (result.success && result.config) {
                const outputPath = path.join(outputDir, generator.configFileName);
                fs.writeFileSync(outputPath, JSON.stringify(result.config, null, 2));
            }
        }
    }

    /**
     * 更新指定语言的 LSP 配置
     * 
     * @param languageId 语言标识符
     * @param preset 当前语言预设
     * @param srcBasePath 源文件基目录
     * @param buildBasePath 构建输出目录
     */
    async updateConfig(
        languageId: string,
        preset: LanguagePreset,
        srcBasePath: string,
        buildBasePath: string
    ): Promise<void> {
        const generator = this.generators.get(languageId);
        if (!generator) { return; }

        // 检查该语言的配置是否启用
        if (!this.config.get<boolean>(generator.settingKey)) { return; }

        const workspace = this.config.workspacePath;
        if (!workspace) { return; }

        const outputDir = path.join(
            workspace,
            this.config.get<string>('lsp_config_path')
                || this.config.get<string>('compile_commands_path')
                || '.vscode'
        );
        fs.mkdirSync(outputDir, { recursive: true });

        // 扫描该语言的源文件
        const files = this.scanSourceFilesForLanguage(srcBasePath, generator.fileExtensions);
        if (files.length === 0) { return; }

        const result = await generator.generate(files, preset, srcBasePath, buildBasePath);

        if (result.warning) {
            vscode.window.showWarningMessage(result.warning);
        }

        if (result.success && result.config) {
            const outputPath = path.join(outputDir, generator.configFileName);
            fs.writeFileSync(outputPath, JSON.stringify(result.config, null, 2));
        }
    }

    /**
     * 扫描源文件，按语言分组
     */
    private scanSourceFiles(srcBasePath: string): Map<string, string[]> {
        const result = new Map<string, string[]>();

        // 构建扩展名到语言的映射
        const extToLanguage = new Map<string, string>();
        for (const generator of this.generators.values()) {
            for (const ext of generator.fileExtensions) {
                extToLanguage.set(ext.toLowerCase(), generator.languageId);
            }
        }

        const scan = (dir: string): void => {
            if (!fs.existsSync(dir)) { return; }

            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // 跳过常见的非源码目录
                    if (!['node_modules', '.git', 'build', 'dist', 'out'].includes(entry.name)) {
                        scan(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).slice(1).toLowerCase();
                    const languageId = extToLanguage.get(ext);
                    if (languageId) {
                        if (!result.has(languageId)) {
                            result.set(languageId, []);
                        }
                        result.get(languageId)!.push(fullPath);
                    }
                }
            }
        };

        scan(srcBasePath);
        return result;
    }

    /**
     * 扫描指定语言的源文件
     */
    private scanSourceFilesForLanguage(srcBasePath: string, extensions: string[]): string[] {
        const files: string[] = [];
        const extSet = new Set(extensions.map(e => e.toLowerCase()));

        const scan = (dir: string): void => {
            if (!fs.existsSync(dir)) { return; }

            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', 'build', 'dist', 'out'].includes(entry.name)) {
                        scan(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).slice(1).toLowerCase();
                    if (extSet.has(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        };

        scan(srcBasePath);
        return files;
    }

    /**
     * 获取所有已注册的语言 ID
     */
    getRegisteredLanguages(): string[] {
        return Array.from(this.generators.keys());
    }
}
