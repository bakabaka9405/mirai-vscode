import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer';

export function saveProblems(provider: ProblemsExplorerProvider) {
	let config = {
		problems: provider.problemsRoot,
	};

	if (vscode.workspace.workspaceFolders) {
		const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const configFile = path.join(workspaceFolder, 'mirai_config.json');
		fs.writeFileSync(configFile, JSON.stringify(config));
	}
}

export function loadProblems() {
	if (vscode.workspace.workspaceFolders) {
		const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const configFile = path.join(workspaceFolder, 'mirai_config.json');

		if (fs.existsSync(configFile)) {
			let config = JSON.parse(fs.readFileSync(configFile).toString());
			return config;
		}
	}

	return {
		problems: []
	};
}