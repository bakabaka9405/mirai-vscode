import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    /** 额外编译器参数 */
    compilerArgs?: string[];
    /** 额外链接器参数 */
    linkerArgs?: string[];
    /** 通过命令动态获取额外编译器参数（如 pkg-config --cflags） */
    compilerArgsCommands?: string[];
    /** 通过命令动态获取额外链接器参数（如 pkg-config --libs） */
    linkerArgsCommands?: string[];
    /** 额外编译参数（旧版，等同于 compilerArgs） */
    additionalArgs?: string[];
    /** 通过命令动态获取额外编译参数（旧版，等同于 compilerArgsCommands） */
    additionalArgsCommands?: string[];
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
    private static readonly commandTimeoutMs = 10000;
    private static readonly commandMaxBuffer = 1024 * 1024;

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
        public additionalArgsCommands: string[] = [],
        public additionalIncludePaths: string[] = [],
        public runtimeArgs: string[] = [],
        public timeoutSec: number = 5,
        public memoryLimitMB: number = 512,
        public mixStdoutStderr: boolean = true,
        public debuggerType: string = '',
        public compilerArgs: string[] = additionalArgs,
        public linkerArgs: string[] = [],
        public compilerArgsCommands: string[] = additionalArgsCommands,
        public linkerArgsCommands: string[] = []
    ) {
        this.additionalArgs = this.compilerArgs;
        this.additionalArgsCommands = this.compilerArgsCommands;
    }

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
            [...this.compilerArgs],
            [...this.compilerArgsCommands],
            [...this.additionalIncludePaths],
            [...this.runtimeArgs],
            this.timeoutSec,
            this.memoryLimitMB,
            this.mixStdoutStderr,
            this.debuggerType,
            [...this.compilerArgs],
            [...this.linkerArgs],
            [...this.compilerArgsCommands],
            [...this.linkerArgsCommands]
        );
    }

    /**
     * 获取用于持久化匹配的稳定键
     */
    getStorageKey(): string {
        const key = {
            label: this.label,
            languageId: this.languageId,
            compilerPath: this.compilerPath,
            interpreterPath: this.interpreterPath,
            runtimePath: this.runtimePath,
            std: this.std,
            optimization: this.optimization,
            additionalArgs: this.compilerArgs,
            additionalArgsCommands: this.compilerArgsCommands,
            additionalIncludePaths: this.additionalIncludePaths,
            runtimeArgs: this.runtimeArgs,
            timeoutSec: this.timeoutSec,
            memoryLimitMB: this.memoryLimitMB,
            mixStdoutStderr: this.mixStdoutStderr,
            debuggerType: this.debuggerType
        } as Record<string, unknown>;

        if (this.linkerArgs.length > 0) {
            key.linkerArgs = this.linkerArgs;
        }
        if (this.linkerArgsCommands.length > 0) {
            key.linkerArgsCommands = this.linkerArgsCommands;
        }

        return JSON.stringify(key);
    }

    /**
     * 从配置对象创建预设
     */
    static fromObject(obj: Partial<ILanguagePreset> & { label: string }): LanguagePreset {
        const compilerArgs = obj.compilerArgs?.slice() || obj.additionalArgs?.slice() || [];
        const linkerArgs = obj.linkerArgs?.slice() || [];
        const compilerArgsCommands = obj.compilerArgsCommands?.slice() || obj.additionalArgsCommands?.slice() || [];
        const linkerArgsCommands = obj.linkerArgsCommands?.slice() || [];

        return new LanguagePreset(
            obj.label,
            obj.languageId || 'cpp',  // 默认 C++，向后兼容
            obj.description || '',
            obj.compilerPath || '',
            obj.interpreterPath || '',
            obj.runtimePath || '',
            obj.std || '',
            obj.optimization || '',
            compilerArgs,
            compilerArgsCommands,
            obj.additionalIncludePaths?.slice() || [],
            obj.runtimeArgs?.slice() || [],
            obj.timeoutSec ?? 5,
            obj.memoryLimitMB ?? 512,
            obj.mixStdoutStderr ?? true,
            obj.debuggerType || '',
            compilerArgs,
            linkerArgs,
            compilerArgsCommands,
            linkerArgsCommands
        );
    }

    /**
     * 解析动态参数命令并返回合并后的新预设
     */
    async withResolvedAdditionalArgs(cwd?: string): Promise<LanguagePreset> {
        const resolvedPreset = this.clone();
        if (resolvedPreset.compilerArgsCommands.length === 0 && resolvedPreset.linkerArgsCommands.length === 0) {
            return resolvedPreset;
        }

        const dynamicCompilerArgs = await LanguagePreset.resolveCommandArgs(
            resolvedPreset.compilerArgsCommands,
            cwd
        );
        const dynamicLinkerArgs = await LanguagePreset.resolveCommandArgs(
            resolvedPreset.linkerArgsCommands,
            cwd
        );

        if (dynamicCompilerArgs.length > 0) {
            resolvedPreset.compilerArgs.push(...dynamicCompilerArgs);
        }
        if (dynamicLinkerArgs.length > 0) {
            resolvedPreset.linkerArgs.push(...dynamicLinkerArgs);
        }

        resolvedPreset.additionalArgs = resolvedPreset.compilerArgs;
        resolvedPreset.additionalArgsCommands = resolvedPreset.compilerArgsCommands;

        return resolvedPreset;
    }

    private static async resolveCommandArgs(commands: string[], cwd?: string): Promise<string[]> {
        const resolvedArgs: string[] = [];

        for (const rawCommand of commands) {
            const command = rawCommand.trim();
            if (!command) {
                continue;
            }

            try {
                const { stdout } = await execAsync(command, {
                    cwd,
                    windowsHide: true,
                    timeout: LanguagePreset.commandTimeoutMs,
                    maxBuffer: LanguagePreset.commandMaxBuffer
                });
                resolvedArgs.push(...LanguagePreset.parseCommandOutputArgs(stdout));
            } catch (error: unknown) {
                const e = error as { message?: string; stderr?: string | Buffer };
                const stderr = e.stderr?.toString().trim();
                const detail = stderr || e.message || '未知错误';
                throw new Error(`执行参数命令失败: ${command}\n${detail}`);
            }
        }

        return resolvedArgs;
    }

    /**
     * 将命令输出按 shell 风格拆分为参数
     */
    private static parseCommandOutputArgs(output: string): string[] {
        const text = output.trim();
        if (!text) {
            return [];
        }

        const args: string[] = [];
        let current = '';
        let quote: '"' | '\'' | null = null;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (quote) {
                if (ch === quote) {
                    quote = null;
                    continue;
                }

                if (ch === '\\' && quote === '"') {
                    const next = text[i + 1];
                    if (next && (next === '"' || next === '\\' || /\s/.test(next))) {
                        current += next;
                        i++;
                        continue;
                    }
                }

                current += ch;
                continue;
            }

            if (ch === '"' || ch === '\'') {
                quote = ch;
                continue;
            }

            if (/\s/.test(ch)) {
                if (current.length > 0) {
                    args.push(current);
                    current = '';
                }
                continue;
            }

            if (ch === '\\') {
                const next = text[i + 1];
                if (next && (/\s/.test(next) || next === '"' || next === '\'' || next === '\\')) {
                    current += next;
                    i++;
                    continue;
                }
            }

            current += ch;
        }

        if (quote) {
            throw new Error('参数命令输出包含未闭合引号');
        }

        if (current.length > 0) {
            args.push(current);
        }

        return args;
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
