import path from "path";
export class TestPreset {
	constructor(
		public label: string,
		public compilerPath: string,
		public std: string = "",
		public optimization: string = "",
		public additionalArgs: string[] = [],
		public additionalIncludePaths: string[] = [],
		public relativeOutputPath: string = "",
		public timeoutSec: number = 1000,
		public memoryLimitMB: number = 512,
		public mixStdoutStderr: boolean = false,
		public description: string = ""
	) { }

	public getExecutableFile(file: string): string {
		return path.join(path.dirname(file),
			this.relativeOutputPath,
			path.basename(file, "cpp") + "exe");
	}

	public static fromObject(obj: any): TestPreset {
		return new TestPreset(
			obj.name,
			obj.compilerPath,
			obj.std,
			obj.optimization,
			obj.additionalArgs,
			obj.additionalIncludePaths,
			obj.relativeOutputPath,
			obj.timeoutSec,
			obj.memoryLimitMB,
			obj.mixStdoutStderr,
			obj.description
		);
	}

	public generateCompileArgs(file: string): string[] {
		let args: string[] = [];
		if (this.std) args.push("-std=" + this.std);
		if (this.optimization) args.push("-" + this.optimization);
		args.push(...this.additionalArgs.slice());
		args.push(...this.additionalIncludePaths.map((p) => `-I${p}`));
		args.push(file);
		args.push("-o");
		args.push(this.getExecutableFile(file));
		return args;
	}

	public generateCompileCommand(file: string): string {
		return `${this.compilerPath} ${this.generateCompileArgs(file).join(" ")}`;
	}
}

export function checkTestPresetLabelUniqueness(presets: TestPreset[]): string | null {
	let labels = new Set<string>();
	for (let preset of presets) {
		if (labels.has(preset.label)) {
			return preset.label;
		}
		labels.add(preset.label);
	}
	return null;
}