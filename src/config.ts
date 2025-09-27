import * as vscode from 'vscode';
import { TestPreset } from './testPreset';
import { getAbsolutePath, getAllExecutable } from './util';
import { execSync } from 'child_process';
let config: vscode.WorkspaceConfiguration;
export let testPresets: TestPreset[];

let _onDidConfigChanged = new vscode.EventEmitter<void>();
export const onDidConfigChanged = _onDidConfigChanged.event;

function getCompilerVersion(compilerPath: string): string | null {
	try {
		const output = execSync(`"${compilerPath}" -dumpversion`, { encoding: 'utf-8' });
		return output.trim();
	} catch (error) {
		console.error("Error getting compiler version:", error);
		return null;
	}
}

function refreshConfig() {
	config = vscode.workspace.getConfiguration("mirai-vscode");
	let obj: any[] = config.get<any[]>("test_presets") || [];
	testPresets = obj.map((o: any) => TestPreset.fromObject(o));
	testPresets.forEach((p) => {
		p.additionalIncludePaths = p.additionalIncludePaths.map((p) => getAbsolutePath(p));
	});
	if (config.get<boolean>("auto_search_compiler")) {
		const compilers = ["g++", "clang++"];
		for (const compiler of compilers) {
			const paths = getAllExecutable(compiler);
			for (const p of paths) {
				testPresets.push(new TestPreset(`${compiler} ${getCompilerVersion(p)}`, p, p));
			}
		}
	}
}

refreshConfig();

vscode.workspace.onDidChangeConfiguration((e) => {
	if (e.affectsConfiguration("mirai-vscode")) {
		refreshConfig();
		_onDidConfigChanged.fire();
	}
});

export function getConfig<T>(section: string): T | undefined {
	return config.get<T>(section);
}

export function getWorkspacePath(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
}