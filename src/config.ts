import * as vscode from 'vscode';
import { TestPreset, checkTestPresetLabelUniqueness } from './testPreset';
let config: vscode.WorkspaceConfiguration;
export let testPresets: TestPreset[];

let _onDidConfigChanged = new vscode.EventEmitter<void>();
export const onDidConfigChanged = _onDidConfigChanged.event;

function refreshConfig() {
	config = vscode.workspace.getConfiguration("mirai-vscode");
	let obj: any[] = config.get<any[]>("test_presets") || [];
	testPresets = obj.map((o: any) => TestPreset.fromObject(o));
	let duplicateLabel = checkTestPresetLabelUniqueness(testPresets);
	if (duplicateLabel) {
		vscode.window.showErrorMessage(`检测到重复的预设名: ${duplicateLabel}，将总是使用同名的第一个预设。`);
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