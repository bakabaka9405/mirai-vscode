import * as path from 'path';
import { ILanguageHandler } from './ILanguageHandler';

/**
 * 语言处理器注册表
 * 
 * 管理所有语言处理器的注册和查找
 */
export class LanguageHandlerRegistry {
    private static instance: LanguageHandlerRegistry;
    private handlers = new Map<string, ILanguageHandler>();
    private extensionMap = new Map<string, string>(); // extension -> languageId

    private constructor() {}

    static getInstance(): LanguageHandlerRegistry {
        if (!LanguageHandlerRegistry.instance) {
            LanguageHandlerRegistry.instance = new LanguageHandlerRegistry();
        }
        return LanguageHandlerRegistry.instance;
    }

    /**
     * 注册语言处理器
     */
    register(handler: ILanguageHandler): void {
        this.handlers.set(handler.languageId, handler);
        
        // 建立文件扩展名到语言的映射
        for (const ext of handler.fileExtensions) {
            this.extensionMap.set(ext.toLowerCase(), handler.languageId);
        }
    }

    /**
     * 获取语言处理器
     */
    getHandler(languageId: string): ILanguageHandler | undefined {
        return this.handlers.get(languageId);
    }

    /**
     * 根据文件扩展名获取语言处理器
     */
    getHandlerByExtension(filePath: string): ILanguageHandler | undefined {
        const ext = path.extname(filePath).toLowerCase().slice(1); // 去掉点号
        const languageId = this.extensionMap.get(ext);
        if (languageId) {
            return this.handlers.get(languageId);
        }
        return undefined;
    }

    /**
     * 根据文件路径检测语言 ID
     */
    detectLanguageId(filePath: string): string | undefined {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        return this.extensionMap.get(ext);
    }

    /**
     * 获取所有已注册的语言 ID
     */
    getRegisteredLanguages(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * 获取所有已注册的处理器
     */
    getAllHandlers(): ILanguageHandler[] {
        return Array.from(this.handlers.values());
    }

    /**
     * 检查语言是否已注册
     */
    hasLanguage(languageId: string): boolean {
        return this.handlers.has(languageId);
    }

    /**
     * 获取支持的文件扩展名列表
     */
    getSupportedExtensions(): string[] {
        return Array.from(this.extensionMap.keys());
    }
}
