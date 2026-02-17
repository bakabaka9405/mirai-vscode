import * as path from 'path';

/**
 * 编译测试预设配置
 */
export interface ITestPreset {
    label: string;
    compilerPath: string;
    description: string;
    std: string;
    optimization: string;
    additionalArgs: string[];
    additionalIncludePaths: string[];
    timeoutSec: number;
    memoryLimitMB: number;
    mixStdoutStderr: boolean;
}

export class TestPreset implements ITestPreset {
    constructor(
        public label: string,
        public compilerPath: string,
        public description: string = '',
        public std: string = '',
        public optimization: string = '',
        public additionalArgs: string[] = [],
        public additionalIncludePaths: string[] = [],
        public timeoutSec: number = 1,
        public memoryLimitMB: number = 512,
        public mixStdoutStderr: boolean = false
    ) {}

    getExecutableFile(srcFile: string, basePath: string, outputPath: string): string {
        const ext = path.extname(srcFile);
        const relativePath = path.relative(basePath, srcFile);
        return path.join(outputPath, path.dirname(relativePath), path.basename(relativePath, ext) + '.exe');
    }

    generateCompileArgs(srcFile: string, basePath: string, outputPath: string): string[] {
        const args: string[] = [];
        if (this.std) { args.push('-std=' + this.std); }
        if (this.optimization) { args.push('-' + this.optimization); }
        args.push(...this.additionalArgs);
        args.push(...this.additionalIncludePaths.map(p => `-I${p}`));
        args.push(srcFile);
        args.push('-o');
        args.push(this.getExecutableFile(srcFile, basePath, outputPath));
        return args;
    }

    generateCompileCommand(srcFile: string, basePath: string, outputPath: string): string {
        return `${this.compilerPath} ${this.generateCompileArgs(srcFile, basePath, outputPath).join(' ')}`;
    }

    clone(): TestPreset {
        return new TestPreset(
            this.label,
            this.compilerPath,
            this.description,
            this.std,
            this.optimization,
            [...this.additionalArgs],
            [...this.additionalIncludePaths],
            this.timeoutSec,
            this.memoryLimitMB,
            this.mixStdoutStderr
        );
    }

    static fromObject(obj: any): TestPreset {
        return new TestPreset(
            obj.label || '',
            obj.compilerPath || '',
            obj.description || '',
            obj.std || '',
            obj.optimization || '',
            obj.additionalArgs?.slice() || [],
            obj.additionalIncludePaths?.slice() || [],
            obj.timeoutSec ?? 1,
            obj.memoryLimitMB ?? 512,
            obj.mixStdoutStderr ?? false
        );
    }
}
