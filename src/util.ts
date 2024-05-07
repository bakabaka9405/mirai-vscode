import * as path from 'path';
import { getWorkspacePath } from './config';
export function getAbsolutePath(p: string): string {
	if (path.isAbsolute(p)) {
		return p;
	}
	let workspacePath = getWorkspacePath();
	if(!workspacePath) {
		throw new Error("No workspace path found.");
	}
	return path.join(workspacePath, p);
}