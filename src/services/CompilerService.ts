import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { spawn } from 'child_process';
import { LanguagePreset } from '../core/models';
import { 
    ILanguageHandler, 
    ICompileResult, 
    LanguageHandlerRegistry,
    CppHandler,
    CHandler,
    PythonHandler,
    JavaHandler,
    RustHandler,
    CustomHandler
} from '../core/handlers';
import { ConfigService } from './ConfigService';

/**
 * 编译服务 - 处理多语言代码编译
 */
export class CompilerService {
    private static instance: CompilerService;
    private fileHashCache = new Map<string, string>();
    private outputChannel: vscode.OutputChannel;
    private config: ConfigService;
    private registry: LanguageHandlerRegistry;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Mirai-vscode：编译输出');
        this.config = ConfigService.getInstance();
        this.registry = LanguageHandlerRegistry.getInstance();
        
        // 注册内置语言处理器
        this.registerBuiltinHandlers();
        
        // 注册自定义语言处理器
        this.registerCustomHandlers();
        
        this.config.onDidChange(() => {
            this.clearCache();
            this.registerCustomHandlers();
        });
    }

    /**
     * 注册内置语言处理器
     */
    private registerBuiltinHandlers(): void {
        this.registry.register(new CppHandler());
        this.registry.register(new CHandler());
        this.registry.register(new PythonHandler());
        this.registry.register(new JavaHandler());
        this.registry.register(new RustHandler());
    }

    /**
     * 注册自定义语言处理器
     */
    private registerCustomHandlers(): void {
        const customLanguages = this.config.customLanguages;
        for (const config of customLanguages) {
            // 跳过与内置语言冲突的配置
            if (this.registry.hasLanguage(config.languageId)) {
                continue;
            }
            this.registry.register(CustomHandler.fromConfig(config));
        }
    }

    static getInstance(): CompilerService {
        if (!CompilerService.instance) {
            CompilerService.instance = new CompilerService();
        }
        return CompilerService.instance;
    }

    /**
     * 获取语言处理器注册表
     */
    getRegistry(): LanguageHandlerRegistry {
        return this.registry;
    }

    clearCache(): void {
        this.fileHashCache.clear();
    }

    /**
     * 编译源文件
     * 
     * @param preset 语言预设
     * @param srcFile 源文件路径
     * @param force 是否强制重新编译
     * @returns 编译结果
     */
    async compile(
        preset: LanguagePreset,
        srcFile: string,
        force: boolean = false
    ): Promise<ICompileResult> {
        const handler = this.registry.getHandler(preset.languageId);
        if (!handler) {
            return {
                success: false,
                message: `不支持的语言: ${preset.languageId}`,
                output: ''
            };
        }

        // 解释型语言不需要编译
        if (!handler.needsCompilation()) {
            return { success: true, message: '无需编译', output: '' };
        }

        const basePath = this.config.srcBasePath;
        const outputPath = this.config.buildBasePath;
        const outputFile = handler.getOutputFile(srcFile, basePath, outputPath);

        // 验证编译器/解释器
        const validationError = await this.validateCompiler(preset, handler);
        if (validationError) {
            return {
                success: false,
                message: validationError,
                output: ''
            };
        }

        // 计算缓存键
        const cacheKey = await this.getCacheKey(srcFile, preset, handler, basePath, outputPath);
        
        if (
            !force
            && cacheKey
            && this.fileHashCache.get(srcFile) === cacheKey
            && fs.existsSync(outputFile)
        ) {
            return { success: true, message: '无变化', output: '' };
        }

        // 执行编译
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `正在编译 (${handler.displayName})...`,
            cancellable: true
        }, async (progress, token) => {
            return handler.compile(srcFile, preset, basePath, outputPath, token);
        });

        // 更新输出通道
        this.outputChannel.clear();
        this.outputChannel.appendLine(result.output);

        // 更新缓存
        if (result.success) {
            const nextCacheKey = cacheKey || await this.getCacheKey(srcFile, preset, handler, basePath, outputPath);
            if (nextCacheKey) {
                this.fileHashCache.set(srcFile, nextCacheKey);
            } else {
                this.fileHashCache.delete(srcFile);
            }
        }

        return result;
    }

    /**
     * 计算缓存键
     */
    private async getCacheKey(
        srcFile: string,
        preset: LanguagePreset,
        handler: ILanguageHandler,
        basePath: string,
        outputPath: string
    ): Promise<string | undefined> {
        const commandString = handler.getCompileCommandString?.(srcFile, preset, basePath, outputPath) 
            || `${preset.languageId}:${preset.label}`;
        const dependencyFiles = await this.getCacheDependencyFiles(srcFile, preset, handler, basePath, outputPath);
        if (!dependencyFiles) {
            return undefined;
        }

        const hash = crypto.createHash('md5');
        hash.update(commandString);
        hash.update('\0');

        for (const file of dependencyFiles) {
            if (!fs.existsSync(file)) {
                return undefined;
            }
            hash.update(file);
            hash.update('\0');
            hash.update(this.getFileHash(file));
            hash.update('\0');
        }

        return hash.digest('hex');
    }

    private async getCacheDependencyFiles(
        srcFile: string,
        preset: LanguagePreset,
        handler: ILanguageHandler,
        basePath: string,
        outputPath: string
    ): Promise<string[] | undefined> {
        try {
            const dependencies = handler.getCacheDependencyFiles
                ? await handler.getCacheDependencyFiles(srcFile, preset, basePath, outputPath)
                : [srcFile];
            if (!dependencies) {
                return undefined;
            }

            return Array.from(new Set(
                [srcFile, ...dependencies].map(file => path.normalize(path.resolve(file)))
            )).sort();
        } catch {
            return undefined;
        }
    }

    /**
     * 验证编译器是否可用
     */
    private async validateCompiler(
        preset: LanguagePreset,
        handler: ILanguageHandler
    ): Promise<string | null> {
        // 先执行 handler 的验证
        const handlerError = handler.validatePreset(preset);
        if (handlerError) {
            return handlerError;
        }

        // 对于编译型语言，检查编译器是否存在
        if (handler.needsCompilation() && preset.compilerPath) {
            const exists = fs.existsSync(preset.compilerPath) 
                || await this.isProgramInPath(preset.compilerPath);
            if (!exists) {
                return `找不到编译器: ${preset.compilerPath}`;
            }
        }

        return null;
    }

    showOutput(): void {
        this.outputChannel.show();
    }

    private getFileHash(file: string): string {
        const hash = crypto.createHash('md5');
        const content = fs.readFileSync(file);
        hash.update(content);
        return hash.digest('hex');
    }

    private async isProgramInPath(program: string): Promise<boolean> {
        return new Promise(resolve => {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            const child = spawn(cmd, [program], { windowsHide: true });
            child.on('exit', code => resolve(code === 0));
            child.on('error', () => resolve(false));
        });
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
