import * as path from 'path';

/**
 * 语言预设配置接口
 */
export interface ILanguagePreset {
    /** 预设名称 */
    label: string;
    /** 描述 */
    description: string;
    /** 超时时间（秒） */
    timeoutSec: number;
    /** 内存限制（MB） */
    memoryLimitMB: number;
    /** 是否混合 stdout 和 stderr */
    mixStdoutStderr: boolean;

    /** 语言标识符 */
    languageId: string;

    // 编译型语言配置
    /** 编译器路径 */
    compilerPath?: string;
    /** 语言标准（如 c++17） */
    std?: string;
    /** 优化级别（如 O2） */
    optimization?: string;
    /** 额外编译参数 */
    additionalArgs?: string[];
    /** 额外包含路径 */
    additionalIncludePaths?: string[];

    // 解释型语言配置
    /** 解释器路径 */
    interpreterPath?: string;
    /** 运行时参数 */
    runtimeArgs?: string[];

    // Java 特有
    /** Java 运行时路径（java 命令） */
    runtimePath?: string;

    // 调试配置
    /** 调试器类型覆盖 */
    debuggerType?: string;
}

/**
 * 语言预设类
 * 
 * 扩展自原有的 TestPreset，支持多种编程语言
 */
export class LanguagePreset implements ILanguagePreset {
    constructor(
        public label: string,
        public languageId: string,
        public description: string = '',
        public compilerPath: string = '',
        public interpreterPath: string = '',
        public runtimePath: string = '',
        public std: string = '',
        public optimization: string = '',
        public additionalArgs: string[] = [],
        public additionalIncludePaths: string[] = [],
        public runtimeArgs: string[] = [],
        public timeoutSec: number = 5,
        public memoryLimitMB: number = 512,
        public mixStdoutStderr: boolean = false,
        public debuggerType: string = ''
    ) {}

    /**
     * 克隆预设
     */
    clone(): LanguagePreset {
        return new LanguagePreset(
            this.label,
            this.languageId,
            this.description,
            this.compilerPath,
            this.interpreterPath,
            this.runtimePath,
            this.std,
            this.optimization,
            [...this.additionalArgs],
            [...this.additionalIncludePaths],
            [...this.runtimeArgs],
            this.timeoutSec,
            this.memoryLimitMB,
            this.mixStdoutStderr,
            this.debuggerType
        );
    }

    /**
     * 获取用于持久化匹配的稳定键
     */
    getStorageKey(): string {
        return JSON.stringify({
            label: this.label,
            languageId: this.languageId,
            compilerPath: this.compilerPath,
            interpreterPath: this.interpreterPath,
            runtimePath: this.runtimePath,
            std: this.std,
            optimization: this.optimization,
            additionalArgs: this.additionalArgs,
            additionalIncludePaths: this.additionalIncludePaths,
            runtimeArgs: this.runtimeArgs,
            timeoutSec: this.timeoutSec,
            memoryLimitMB: this.memoryLimitMB,
            mixStdoutStderr: this.mixStdoutStderr,
            debuggerType: this.debuggerType
        });
    }

    /**
     * 从配置对象创建预设
     */
    static fromObject(obj: Partial<ILanguagePreset> & { label: string }): LanguagePreset {
        return new LanguagePreset(
            obj.label,
            obj.languageId || 'cpp',  // 默认 C++，向后兼容
            obj.description || '',
            obj.compilerPath || '',
            obj.interpreterPath || '',
            obj.runtimePath || '',
            obj.std || '',
            obj.optimization || '',
            obj.additionalArgs?.slice() || [],
            obj.additionalIncludePaths?.slice() || [],
            obj.runtimeArgs?.slice() || [],
            obj.timeoutSec ?? 5,
            obj.memoryLimitMB ?? 512,
            obj.mixStdoutStderr ?? false,
            obj.debuggerType || ''
        );
    }

    /**
     * 判断是否为编译型语言预设
     */
    isCompiled(): boolean {
        return ['cpp', 'c', 'java', 'rust'].includes(this.languageId);
    }

    /**
     * 判断是否为解释型语言预设
     */
    isInterpreted(): boolean {
        return ['python'].includes(this.languageId);
    }
}
