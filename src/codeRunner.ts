import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProblemsItem } from './problemsExplorer';
import { CaseGroup, CaseNode, CaseViewProvider } from './caseView';
import { spawn } from 'child_process';

const ac_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'check.svg'));
const wa_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'error.svg'));
const re_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'bug.svg'));
const tle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'clock.svg'));
const mle_icon = vscode.Uri.file(path.join(__dirname, '..', 'media', 'memory.svg'));
const input_file = path.join(os.tmpdir(), 'mirai-vscode', 'in.txt');
const output_file = path.join(os.tmpdir(), 'mirai-vscode', 'out.txt');
const err_file = path.join(os.tmpdir(), 'mirai-vscode', 'err.txt');

function runSubprocess(command: string, args: string[], timeoutSec: number, memoryLimitMB: number): Promise<{ code: number | null, message: string }> {
	return new Promise((resolve) => {
		const input = fs.openSync(input_file, 'r');
		const out = fs.openSync(output_file, 'w');
		const err = fs.openSync(err_file, 'w');
		const child = spawn(command, args, { stdio: [input, out, err], windowsHide: true });
		// Set resource limits for time and memory
		const timeoutId = setTimeout(() => {
			child.kill();
			resolve({ code: null, message: 'Timeout expired' });
		}, timeoutSec * 1000);

		child.on('exit', (code) => {
			clearTimeout(timeoutId);
			resolve({ code, message: `Process exited with code ${code}` });
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
			const child = spawn("g++", [sourceFile, "-o", dstFile]);
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

	console.log(result.message);
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

function readOutputFile(outputFile: string): string {
	return fs.readFileSync(outputFile).toString();
}

function trimEndSpaceEachLine(input: string): string {
	return input.split('\n').map((line) => line.trimEnd()).join('\n').trimEnd();
}

function compareOutput(output: string, expected: string) {
	return trimEndSpaceEachLine(output) === trimEndSpaceEachLine(expected);
}

export async function doTest(testCases: CaseNode[], caseViewProvider: CaseViewProvider, caseView: vscode.TreeView<CaseNode>) {
	let sourceFile = getCurrentFile();
	if (sourceFile == "") {
		vscode.window.showErrorMessage("未打开文件");
		return;
	}
	if (testCases.length == 0) {
		vscode.window.showErrorMessage("未添加测试用例");
		return;
	}
	const executableFile = getExecutableFile(sourceFile);
	fs.mkdirSync(path.join(os.tmpdir(), 'mirai-vscode'), { recursive: true });
	let { code, message } = await compile(sourceFile, executableFile);
	if (code === 0) {
		for (let c of testCases) {
			caseView.reveal(c);
			fs.writeFileSync(input_file, c.input);
			let { code, message } = await runSubprocess(executableFile, [], 1, 256);
			c.output = readOutputFile(output_file);
			if (code === 0) {
				if (compareOutput(c.output, c.expectedOutput)) {
					c.iconPath = { light: ac_icon, dark: ac_icon};
				}
				else {
					c.iconPath = {light:wa_icon, dark:wa_icon};
				}
			}
			else if(code==null&&message=='Timeout expired'){
				c.iconPath = {light:tle_icon, dark:tle_icon};
			}
			else {
				c.iconPath = {light:re_icon, dark:re_icon};
			}

			caseViewProvider.refresh(c);
		}
		vscode.window.showInformationMessage("测试完成");
	}
	else {
		vscode.window.showErrorMessage("编译失败");
	}
}