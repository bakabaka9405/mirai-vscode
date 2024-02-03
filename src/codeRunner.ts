import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProblemsItem } from './problemsExplorer';
import { CaseGroup, CaseNode, CaseViewProvider } from './caseView';
import { spawn } from 'child_process';
import pisusage from 'pidusage';

const ac_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'check.svg'));
const wa_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'error.svg'));
const re_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'bug.svg'));
const tle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'clock.svg'));
const mle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'memory.svg'));
const input_file = path.join(os.tmpdir(), '.mirai-vscode', 'in.txt');
const output_file = path.join(os.tmpdir(), '.mirai-vscode', 'out.txt');
const err_file = path.join(os.tmpdir(), '.mirai-vscode', 'err.txt');

let config = vscode.workspace.getConfiguration("mirai-vscode");
vscode.workspace.onDidChangeConfiguration((e) => {
	if (e.affectsConfiguration("mirai-vscode")) {
		config = vscode.workspace.getConfiguration("mirai-vscode");
	}
});

function runSubprocess(command: string, args: string[], timeoutSec: number, memoryLimitMB: number): Promise<{ code: number | null, time: number | null, memory: number | null, message: string }> {
	return new Promise((resolve) => {
		const input = fs.openSync(input_file, 'r');
		const out = fs.openSync(output_file, 'w');
		const err = fs.openSync(config.get<Boolean>("mix_stdout_stderr") ? output_file : err_file, 'w');
		const startTime = process.hrtime.bigint();
		const child = spawn(command, args, { stdio: [input, out, err], windowsHide: true });
		const pid = child.pid;
		if (!pid) {
			resolve({ code: null, time: null, memory: null, message: 'Spawn failed' });
		}

		let maxMemoryUsage = 0;
		// Set resource limits for time and memory
		const timeoutId = setTimeout(() => {
			child.kill();
			resolve({ code: null, time: timeoutSec, memory: maxMemoryUsage, message: 'Time limit exceeded' });
		}, timeoutSec * 1000);

		child.on('exit', (code) => {
			clearTimeout(timeoutId);
			resolve({
				code,
				time: Number(process.hrtime.bigint() - startTime) / 1e6,
				memory: maxMemoryUsage,
				message: `Process exited with code ${code}`
			});
		});

		child.on('error', (error) => {
			clearTimeout(timeoutId);;
			resolve({
				code: null,
				time: null,
				memory: null,
				message: `Runtime Error`
			});
		});
	});
}

async function compile(sourceFile: string, dstFile: string) {
	const result = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "正在编译...",
		cancellable: false
	}, async (progress) => {
		return new Promise<{ code: number, message: string }>((resolve) => {
			const compiler = config.get<string>("compiler_path");
			const args = config.get<string[]>("compile_args");
			let opt_relative_path = config.get<string>("output_relative_path");
			if (!opt_relative_path) opt_relative_path = "";
			if (!compiler || !args) {
				console.log("No compiler configured");
				resolve({ code: -1, message: "No compiler configured" });
				return;
			}
			const child = spawn(compiler,
				[...args, sourceFile, '-o',
				path.join(path.dirname(sourceFile),
					opt_relative_path,
					path.basename(sourceFile,"cpp")+"exe")],
				{ windowsHide: true });
			child.on('exit', (code) => {
				if (code === 0) {
					resolve({ code, message: `Process exited with code ${code}` });
				}
				else {
					resolve({ code: -1, message: `Compilation failed` });
				}
			});
		});
	});
	return result;
}

function getCurrentFile(): string {
	if (vscode.window.activeTextEditor) {
		return vscode.window.activeTextEditor.document.fileName;
	}
	return "";
}

function getExecutableFile(sourceFile: string): string {
	return sourceFile.replace(/\.\w+$/, ".exe");
}

function getFileBasePath(file: string): string {
	return path.dirname(file);
}

function getFileName(file: string): string {
	return path.basename(file);
}

function readOutputFile(outputFile: string): string {
	return fs.readFileSync(outputFile).toString();
}

function trimEndSpaceEachLine(input: string): string {
	return input.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd();
}

function compareOutput(output: string, expected: string) {
	return trimEndSpaceEachLine(output) === trimEndSpaceEachLine(expected);
}

function prepareForCompile(): { sourceFile: string, executableFile: string } {
	let sourceFile = getCurrentFile();
	const executableFile = getExecutableFile(sourceFile);
	fs.mkdirSync(path.join(os.tmpdir(), '.mirai-vscode'), { recursive: true });
	return { sourceFile, executableFile };
}

async function doSingleTestimpl(testCase: CaseNode) {
	fs.writeFileSync(input_file, testCase.input);
	let { code, message } = await runSubprocess(getExecutableFile(getCurrentFile()), [], 1, 256);
	testCase.output = readOutputFile(output_file);
	if (code === 0) {
		if (compareOutput(testCase.output, testCase.expectedOutput)) {
			testCase.iconPath = { light: ac_icon, dark: ac_icon };
		}
		else {
			testCase.iconPath = { light: wa_icon, dark: wa_icon };
		}
	}
	else if (code == null && message == 'Time limit exceeded') {
		testCase.iconPath = { light: tle_icon, dark: tle_icon };
	}
	else if (code == null && message == 'Memory limit exceeded') {
		testCase.iconPath = { light: mle_icon, dark: mle_icon };
	}
	else if ((code == null && message == 'Runtime Error' || code !== 0)) {
		testCase.iconPath = { light: re_icon, dark: re_icon };
	}
}

export async function doSingleTest(testCase: CaseNode) {
	const { sourceFile, executableFile } = prepareForCompile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	const { code, message } = await compile(sourceFile, executableFile);
	console.log(message);
	if (code === 0) {
		await doSingleTestimpl(testCase);
	}
	else {
		vscode.window.showErrorMessage("编译失败");
	}
}

export async function doTest(testCases: CaseNode[], caseViewProvider: CaseViewProvider, caseView: vscode.TreeView<CaseNode>) {
	const { sourceFile, executableFile } = prepareForCompile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	if (testCases.length == 0) {
		vscode.window.showErrorMessage("未添加测试用例");
		return;
	}
	const { code, message } = await compile(sourceFile, executableFile);
	if (code === 0) {
		for (let c of testCases) {
			caseView.reveal(c);
			await doSingleTestimpl(c);
			caseViewProvider.refresh(c);
		}
		vscode.window.showInformationMessage("测试完成");
	}
	else {
		vscode.window.showErrorMessage("编译失败");
	}
}