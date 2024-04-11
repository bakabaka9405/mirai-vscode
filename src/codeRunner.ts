import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CaseGroup, CaseNode, CaseViewProvider } from './caseView';
import { spawn } from 'child_process';
import { TestPreset } from './testPreset';
import { onDidConfigChanged } from './config';
const ac_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'check.svg'));
const wa_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'error.svg'));
const re_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'bug.svg'));
const tle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'clock.svg'));
const mle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'memory.svg'));
let file_md5_table = new Map<string, string>();

export function clearCompileCache() {
	file_md5_table.clear();
}

onDidConfigChanged(() => clearCompileCache());

function runSubprocess(file: string, args: string[], timeoutSec: number, memoryLimitMB: number, input: string,
	mixStdoutStderr: boolean, token: vscode.CancellationToken)
	: Promise<{ code: number | null, time: number | null, memory: number | null, message: string, output: string | null }> {
	return new Promise((resolve) => {
		let output = "";
		const startTime = process.hrtime.bigint();
		const child = spawn(file, args, { windowsHide: true });

		let maxMemoryUsage = 0;
		const timeoutId = setTimeout(() => {
			child.kill();
			resolve({
				code: null,
				time: timeoutSec * 1000,
				memory: maxMemoryUsage,
				message: 'Time limit exceeded',
				output
			});
		}, timeoutSec * 1000);

		//listen cancellationToken
		token.onCancellationRequested(() => {
			child.kill();
			resolve({
				code: null,
				time: null,
				memory: null,
				message: 'Cancelled',
				output
			});
		});

		child.on('exit', (code) => {
			clearTimeout(timeoutId);
			resolve({
				code,
				time: Number(process.hrtime.bigint() - startTime) / 1e6,
				memory: maxMemoryUsage,
				message: `Process exited with code ${code}`,
				output
			});
		});

		child.stdin.write(input);
		child.stdin.end();

		child.stdout.on('data', (data: string) => output += data);
		if (mixStdoutStderr) {
			child.stderr.on('data', (data: string) => output += data);
		}
		child.on('error', (error) => {
			clearTimeout(timeoutId);
			resolve({
				code: null,
				time: null,
				memory: null,
				message: `Runtime Error: ${error.message}`,
				output
			});
		});
	});
}

async function isProgramInPath(program: string) {
	const child = spawn('where', [program], { windowsHide: true });
	return new Promise<boolean>((resolve) => {
		child.on('exit', (code) => {
			resolve(code === 0);
		});
	});
}

async function compile(preset: TestPreset, srcFile: string, force: boolean = false) {
	if (file_md5_table.get(srcFile) === getFileMD5(srcFile) && !force) {
		return Promise.resolve({ code: 0, message: "No change", output: "" });
	}
	if (!fs.existsSync(preset.compilerPath) && !await isProgramInPath(preset.compilerPath)) {
		return Promise.resolve({ code: -1, message: `找不到编译器 ${preset.label}。期望路径：${preset.compilerPath}`, output: "" });
	}
	const result = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "正在编译...",
		cancellable: true
	}, async (progress, token) => {
		return new Promise<{ code: number, message: string, output: string }>((resolve) => {
			const child = spawn(preset.compilerPath, preset.generateCompileArgs(srcFile),
				{ windowsHide: true });
			let output = '';

			child.stdout.on('data', (data) => {
				output += data.toString();
			});

			child.stderr.on('data', (data) => {
				output += data.toString();
			});
			child.on('exit', (code) => {
				if (code === 0) {
					file_md5_table.set(srcFile, getFileMD5(srcFile));
					resolve({ code, message: `Process exited with code ${code}`, output });
				}
				else {
					resolve({ code: -1, message: `Compilation failed`, output });
				}
			});
			token.onCancellationRequested(() => {
				child.kill();
				resolve({ code: -1, message: `Cancelled`, output: "" });
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

function getFileMD5(file: string): string {
	const crypto = require('crypto');
	const hash = crypto.createHash('md5');
	const input = fs.readFileSync(file);
	hash.update(input);
	return hash.digest('hex');
}

function trimEndSpaceEachLine(input: string): string {
	return input.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd();
}

function compareOutput(output: string, expected: string) {
	return trimEndSpaceEachLine(output) === trimEndSpaceEachLine(expected);
}

async function doSingleTestImpl(preset: TestPreset, file: string, testCase: CaseNode, token: vscode.CancellationToken) {
	let { code, time, memory, message, output } =
		await runSubprocess(preset.getExecutableFile(file), [], preset.timeoutSec, preset.memoryLimitMB, testCase.input, preset.mixStdoutStderr, token);
	testCase.output = output || "";
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
	else if (code == null && message == 'Cancelled') {
		testCase.iconPath = undefined;
	}
	else if ((code == null && message == 'Runtime Error') || code !== 0) {
		testCase.iconPath = { light: re_icon, dark: re_icon };
	}
	console.log(message);
}

let outputChannel = vscode.window.createOutputChannel("Mirai-vscode：编译输出");

export async function doSingleTest(preset: TestPreset, testCase: CaseNode, forceCompile: boolean = false) {
	const sourceFile = getCurrentFile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	const { code, message, output } = await compile(preset, sourceFile, forceCompile);
	console.log(message);
	if (code === 0) {
		const result = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "正在测试...",
			cancellable: true
		}, async (progress, token) => {
			await doSingleTestImpl(preset, sourceFile, testCase, token);
			return !token.isCancellationRequested;
		});
	}
	else {
		vscode.window.showErrorMessage(`编译失败：${message}`, "查看详细信息").then((value) => {
			if (value) {
				outputChannel.clear();
				outputChannel.appendLine(output);
				outputChannel.show();
			}
		});
	}
}

let terminal: vscode.Terminal | undefined = undefined;

export async function compileAndRun(preset: TestPreset, forceCompile: boolean = false) {
	const sourceFile = getCurrentFile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}

	const { code, message, output } = await compile(preset, sourceFile, forceCompile);
	if (code === 0) {
		if (!terminal) terminal = vscode.window.createTerminal("mirai-vscode:编译运行");
		terminal.sendText(preset.getExecutableFile(sourceFile));
		terminal.show();
	}
	else {
		vscode.window.showErrorMessage(`编译失败：${message}`, "查看详细信息").then((value) => {
			if (value) {
				outputChannel.clear();
				outputChannel.appendLine(output);
				outputChannel.show();
			}
		});
	}
}

export async function doTest(preset: TestPreset, testCases: CaseNode[], caseViewProvider: CaseViewProvider,
	caseView: vscode.TreeView<CaseNode>, forceCompile: boolean = false) {
	const sourceFile = getCurrentFile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	if (testCases.length == 0) {
		vscode.window.showErrorMessage("未添加测试用例");
		return;
	}
	const { code, message, output } = await compile(preset, sourceFile, forceCompile);
	if (code === 0) {
		const result = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "正在测试...",
			cancellable: true
		}, async (progress, token) => {
			for (let c of testCases) {
				if (token.isCancellationRequested) {
					c.iconPath = undefined;
				}
				caseView.reveal(c);
				await doSingleTestImpl(preset, sourceFile, c, token);
				caseViewProvider.refresh(c);
				progress.report({ increment: 100 / testCases.length });
			}
			return !token.isCancellationRequested;
		});
		if (result) vscode.window.showInformationMessage("测试完成");
		else vscode.window.showInformationMessage("测试中断");
	}
	else {
		vscode.window.showErrorMessage(`编译失败：${message}`, "查看详细信息").then((value) => {
			if (value) {
				outputChannel.clear();
				outputChannel.appendLine(output);
				outputChannel.show();
			}
		});
	}
}