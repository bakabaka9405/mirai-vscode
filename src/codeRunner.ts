import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CaseGroup, CaseNode, CaseViewProvider } from './caseView';
import { spawn } from 'child_process';

const ac_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'check.svg'));
const wa_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'error.svg'));
const re_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'bug.svg'));
const tle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'clock.svg'));
const mle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'memory.svg'));
let config_has_changed = false;
let file_md5_table = new Map<string, string>();

let config = vscode.workspace.getConfiguration("mirai-vscode");
vscode.workspace.onDidChangeConfiguration((e) => {
	if (e.affectsConfiguration("mirai-vscode")) {
		config = vscode.workspace.getConfiguration("mirai-vscode");
		config_has_changed = true;
	}
});

function runSubprocess(file: string, args: string[], timeoutSec: number, memoryLimitMB: number, input: string)
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
		if (config.get<boolean>("mix_stdout_stderr")) {
			child.stderr.on('data', (data: string) => output += data);
		}
		child.on('error', (error) => {
			clearTimeout(timeoutId);
			resolve({
				code: null,
				time: null,
				memory: null,
				message: `Runtime Error`,
				output
			});
		});
	});
}

async function compile(srcFile: string, dstFile: string) {
	if (!config_has_changed && file_md5_table.get(srcFile) === getFileMD5(srcFile)) {
		return Promise.resolve({ code: 0, message: "No change", output: "" });
	}
	const result = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "正在编译...",
		cancellable: false
	}, async (progress) => {
		return new Promise<{ code: number, message: string, output: string }>((resolve) => {
			const compiler = config.get<string>("compiler_path");
			const args = config.get<string[]>("compile_args");
			if (!compiler || !args) {
				console.log("No compiler configured");
				resolve({ code: -1, message: "No compiler configured", output: "" });
				return;
			}
			console.log();
			const child = spawn(compiler, [...args, srcFile, '-o', dstFile],
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

function prepareForCompile(): { sourceFile: string, executableFile: string } {
	const sourceFile = getCurrentFile();
	let opt_relative_path = config.get<string>("output_relative_path");
	if (!opt_relative_path) opt_relative_path = "";
	const executableFile = path.join(path.dirname(sourceFile),
		opt_relative_path,
		path.basename(sourceFile, "cpp") + "exe")
	return { sourceFile, executableFile };
}

async function doSingleTestImpl(testCase: CaseNode, executableFile: string) {
	let timeOutSec = config.get<number>("default_timeout");
	if (!timeOutSec) timeOutSec = 1;
	let { code, time, memory, message, output } = await runSubprocess(executableFile, [], timeOutSec, 256, testCase.input);
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
	else if ((code == null && message == 'Runtime Error' || code !== 0)) {
		testCase.iconPath = { light: re_icon, dark: re_icon };
	}
}

let outputChannel = vscode.window.createOutputChannel("Mirai-vscode：编译输出");

export async function doSingleTest(testCase: CaseNode) {
	const { sourceFile, executableFile } = prepareForCompile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	const { code, message, output } = await compile(sourceFile, executableFile);
	console.log(message);
	if (code === 0) {
		await doSingleTestImpl(testCase, executableFile);
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
	const { code, message, output } = await compile(sourceFile, executableFile);
	if (code === 0) {
		for (let c of testCases) {
			caseView.reveal(c);
			await doSingleTestImpl(c, executableFile);
			caseViewProvider.refresh(c);
		}
		let disposable=vscode.window.showInformationMessage("测试完成");
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