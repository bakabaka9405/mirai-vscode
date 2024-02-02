import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ProblemsItem } from './problemsExplorer';
import { CaseGroup, CaseNode, CaseViewProvider } from './caseView';
import { spawn } from 'child_process';

function runSubprocess(command: string, args: string[], timeoutSec: number, memoryLimitMB: number): Promise<{ code: number | null, message: string }> {
	return new Promise((resolve) => {
		let in_path = path.join(os.tmpdir(), 'mirai-vscode', 'in.txt');
		let out_path = path.join(os.tmpdir(), 'mirai-vscode', 'out.txt');
		let err_path = path.join(os.tmpdir(), 'mirai-vscode', 'err.txt');
		const input = fs.openSync(in_path, 'r');
		const out = fs.openSync(out_path, 'w');
		const err = fs.openSync(err_path, 'w');
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

function runCommandInTerminal(command: string, args: string[]): Promise<{ code: number | null, message: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: 'pipe' });
		const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
		terminal.show();
		terminal.sendText(`$(command) $(args)`, false);
		child.stdout.on('data', (data) => {
			terminal.sendText(data.toString(), false);
		});

		child.stderr.on('data', (data) => {
			terminal.sendText(data.toString(), false);
		});

		child.on('exit', (code) => {
			resolve({ code, message: `Process exited with code ${code}` });
		});
	});
}

async function compile(sourceFile: string, dstFile: string) {
	const result = await runCommandInTerminal('g++', [sourceFile, '-o', dstFile]);
	console.log(result.message);
	//vscode.commands.executeCommand('workbench.view.extension.caseView');
	return result;
}

function getCurrentFile(): string {
	if (vscode.window.activeTextEditor) {
		return vscode.window.activeTextEditor.document.fileName;
	}
	return "";
}

function getOutputFile(sourceFile: string): string {
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

export async function doTest(problem: ProblemsItem, caseViewProvider: CaseViewProvider, caseView: vscode.TreeView<CaseNode>) {
	let sourceFile = getCurrentFile();
	let outputFile = getOutputFile(sourceFile);
	console.log(sourceFile, outputFile);
	let { code, message } = await compile(sourceFile, outputFile);
	if (code === 0) {
		let testCases = problem.caseGroup.data;
		for (let c of testCases) {
			c.iconPath = new vscode.ThemeIcon("loading");
			caseViewProvider.refresh();
			caseView.reveal(c);
			//创建mirai-vscode文件夹
			fs.mkdirSync(path.join(os.tmpdir(), 'mirai-vscode'), { recursive: true });
			fs.writeFileSync(path.join(os.tmpdir(), 'mirai-vscode', 'in.txt'), c.input);
			let { code, message } = await runSubprocess(outputFile, [], 1, 256);
			c.output = readOutputFile(path.join(os.tmpdir(), 'mirai-vscode', 'out.txt'));
			if (code === 0) {
				if (compareOutput(c.output, c.expectedOutput)) {
					c.iconPath = new vscode.ThemeIcon("pass");
				}
				else {
					c.iconPath = new vscode.ThemeIcon("error");
				}
			}
			else {
				c.iconPath = new vscode.ThemeIcon("error");
			}
			
			caseViewProvider.refresh();
		}
	}
	else {
		vscode.window.showErrorMessage("Compilation failed");
	}
}