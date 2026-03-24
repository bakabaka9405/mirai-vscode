import * as vscode from 'vscode';
import { LanguagePreset } from '../models/LanguagePreset';

/**
 * 编译结果
 */
export interface ICompileResult {
    success: boolean;
    message: string;
    output: string;
}

/**
 * 运行命令配置
 */
export interface IRunCommand {
    command: string;
    args: string[];
    cwd?: string;
}

/**
 * 编译命令配置
 */
export interface ICompileCommand {
    command: string;
    args: string[];
}

/**
 * 调试配置
 */
export interface IDebugConfig {
    type: string;
    extensionId: string;
    request: 'launch' | 'attach';
    name?: string;
    program?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    stdio?: (string | null)[];
    [key: string]: unknown;
}

/**
 * 调试器信息
 */
export interface IDebuggerInfo {
    type: string;
    extensionId: string;
    displayName: string;
}

/**
 * 语言处理器接口
 * 
 * 每种编程语言实现此接口以提供编译和运行支持
 */
export interface ILanguageHandler {
    /** 语言标识符 */
    readonly languageId: string;
    
    /** 显示名称 */
    readonly displayName: string;
    
    /** 支持的文件扩展名（不含点号） */
    readonly fileExtensions: string[];

    /**
     * 是否需要编译步骤
     */
    needsCompilation(): boolean;

    /**
     * 编译源文件
     * 
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @param token 取消令牌
     * @returns 编译结果
     */
    compile(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string,
        token: vscode.CancellationToken
    ): Promise<ICompileResult>;

    /**
     * 获取运行命令
     * 
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 运行命令配置
     */
    getRunCommand(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IRunCommand;

    /**
     * 获取输出文件路径（编译后的可执行文件或入口文件）
     * 
     * @param srcFile 源文件路径
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 输出文件路径
     */
    getOutputFile(
        srcFile: string,
        basePath: string,
        outputPath: string
    ): string;

    /**
     * 获取调试配置
     * 
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 调试配置，如果不支持调试则返回 undefined
     */
    getDebugConfig?(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): IDebugConfig | undefined;

    /**
     * 获取支持的调试器列表
     * 
     * @returns 调试器信息数组
     */
    getSupportedDebuggers?(): IDebuggerInfo[];

    /**
     * 验证预设配置
     * 
     * @param preset 语言预设
     * @returns 错误信息，如果验证通过则返回 null
     */
    validatePreset(preset: LanguagePreset): string | null;

    /**
     * 获取结构化编译命令（用于生成 compile_commands.json）
     * 
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 编译命令配置
     */
    getCompileCommand?(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): ICompileCommand;

    /**
     * 生成编译命令字符串（用于缓存键）
     * 
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 编译命令字符串
     */
    getCompileCommandString?(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): string;

    /**
     * 获取用于编译缓存判断的依赖文件列表
     *
     * 返回 undefined 表示无法可靠获取依赖，此时调用方应保守地重新编译
     *
     * @param srcFile 源文件路径
     * @param preset 语言预设
     * @param basePath 源文件基目录
     * @param outputPath 输出目录
     * @returns 依赖文件路径列表；若无法确定则返回 undefined
     */
    getCacheDependencyFiles?(
        srcFile: string,
        preset: LanguagePreset,
        basePath: string,
        outputPath: string
    ): Promise<string[] | undefined>;

    /**
     * 应用调试模式修改到预设
     * 
     * @param preset 语言预设（会被修改）
     */
    applyDebugMode?(preset: LanguagePreset): void;
}
