import path from "path";
import { getConfig } from "./config";
export class TestPreset {
	constructor(
		public label: string,
		public compilerPath: string,
		public description: string = "",
		public std: string = "",
		public optimization: string = "",
		public additionalArgs: string[] = [],
		public additionalIncludePaths: string[] = [],
		public timeoutSec: number = 1,
		public memoryLimitMB: number = 512,
		public mixStdoutStderr: boolean = false,
	) { }


	public getExecutableFile(file: string, basePath: string, outputPath: string): string {
		//console.log(file, basePath, outputPath)
		let ext = path.extname(file);
		let relativePath = path.relative(basePath, file);
		//console.log(relativePath)
		// let res = path.join(outputPath, path.dirname(relativePath), path.basename(relativePath, ext) + ".exe");
		//console.log(res);
		return path.join(outputPath, path.dirname(relativePath), path.basename(relativePath, ext) + ".exe");
	}

	public static fromObject(obj: any): TestPreset {
		return new TestPreset(
			obj.name,
			obj.compilerPath,
			obj.description,
			obj.std,
			obj.optimization,
			obj.additionalArgs.slice(),
			obj.additionalIncludePaths.slice(),
			obj.timeoutSec,
			obj.memoryLimitMB,
			obj.mixStdoutStderr,
		);
	}

	public generateCompileArgs(file: string, basePath: string, outputPath: string): string[] {
		let args: string[] = [];
		if (this.std) args.push("-std=" + this.std);
		if (this.optimization) args.push("-" + this.optimization);
		args.push(...this.additionalArgs.slice());
		args.push(...this.additionalIncludePaths.map((p) => `-I${p}`));
		args.push(`${file}`);
		args.push("-o");
		args.push(`${this.getExecutableFile(file, basePath, outputPath)}`);
		return args;
	}

	public generateCompileCommand(file: string, basePath: string, outputPath: string): string {
		return `${this.compilerPath} ${this.generateCompileArgs(file, basePath, outputPath).join(" ")}`;
	}
}