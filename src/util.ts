import * as path from 'path';
import { getWorkspacePath } from './config';
export function getAbsolutePath(p: string): string {
	if (path.isAbsolute(p)) {
		return p;
	}
	let workspacePath = getWorkspacePath();
	if (!workspacePath) {
		throw new Error("No workspace path found.");
	}
	return path.join(workspacePath, p);
}

export function getAllExecutable(name: string): string[] {
	const fs = require('fs');
	const paths = process.env.PATH?.split(path.delimiter) || [];
	const results: string[] = [];
	if (process.platform === 'win32' && !name.endsWith('.exe')) {
		name += '.exe';
	}
	for (const p of paths) {
		const fullPath = path.join(p, name);
		if (fs.existsSync(fullPath)) {
			results.push(fullPath);
		}
	}
	return results;
}