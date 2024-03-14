import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestPreset } from './testPreset';

function generateSingleCompileCommandJson(preset: TestPreset, file: string): { directory: string, command: string, file: string } {
	let command = preset.generateCompileCommand(file);
	return {
		directory: path.dirname(file),
		command: command,
		file: file
	};
}

export function generateAllCompileCommandJson(preset: TestPreset, baseDir: string): string {
	let files: string[] = [];
	let walkDir = (dir: string) => {
		fs.readdirSync(dir).forEach((file) => {
			let fullPath = path.join(dir, file);
			if (fs.statSync(fullPath).isDirectory()) {
				walkDir(fullPath);
			}
			else if (file.endsWith(".cpp")) {
				files.push(fullPath);
			}
		});
	}
	walkDir(baseDir);
	let commands = files.map((file) => generateSingleCompileCommandJson(preset, file));
	return JSON.stringify(commands);
}

export function updateCompileCommands(preset: TestPreset, baseDir: string): void {
	let compileCommands = generateAllCompileCommandJson(preset, baseDir);
	fs.writeFileSync(path.join(baseDir, "compile_commands.json"), compileCommands);
}