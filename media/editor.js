const vscode = acquireVsCodeApi();
require.config({
	paths: {
		'vs': MonacoBaseUri
	}
});

function rgbaToHex(rgba) {
	// 移除 rgba() 中的 "rgba(" 和 ")"，并拆分成数组
	const rgbaValues = rgba.substring(rgba.indexOf('(') + 1, rgba.length - 1).split(',');

	const r = parseInt(rgbaValues[0].trim());
	const g = parseInt(rgbaValues[1].trim());
	const b = parseInt(rgbaValues[2].trim());
	const a = parseFloat(rgbaValues[3].trim()); // Alpha 值

	// 将 alpha 值转换为 0-255 的范围
	const alpha = Math.round(a * 255);

	// 使用位运算和 toString(16) 转换成十六进制，并补零
	const hexR = r.toString(16).padStart(2, '0');
	const hexG = g.toString(16).padStart(2, '0');
	const hexB = b.toString(16).padStart(2, '0');
	const hexA = alpha.toString(16).padStart(2, '0'); // Alpha 的十六进制值

	// 返回完整的十六进制颜色代码 (包括 alpha)
	return `#${hexR}${hexG}${hexB}${hexA}`;
}

function readVsCodeColor(name) {
	const styles = getComputedStyle(document.documentElement);
	let res = styles.getPropertyValue(`--vscode-${name}`).trim();
	let backup = res;
	if (res.startsWith('rgba')) res = rgbaToHex(res);
	console.log(name, backup, res);
	return res;
}

function addThemeStyle(colors, family, attrs) {
	for (const attr of attrs) {
		let color = readVsCodeColor(`${family}-${attr}`);
		if (color) colors[`${family}.${attr}`] = color;
	}
}


require(['vs/editor/editor.main'], function () {
	var editor = monaco.editor.create(document.getElementById('editor'), {
		value: '',
		language: 'plaintext',
		lineNumbers: 'on',
		minimap: { enabled: false },
		hover: { enabled: false },
		automaticLayout: true,
		lineNumbersMinChars: 2,
		lineDecorationsWidth: 1,
		contextmenu: false,
		fontFamily: "'Jetbrains Mono Medium','Microsoft YaHei Mono',Consolas,'Microsoft YaHei', monospace",
		quickSuggestions: false,
	});

	function updateTheme() {
		let colors = {};
		addThemeStyle(colors, 'editor', [
			'background',
			'foreground',
			'lineHighlightBackground',
			// 'lineHighlightBorder',
			'selectionForeground',
			'selectionBackground',
			'selectionHighlightBackground',
			'inactiveSelectionBackground',
			'wordHighlightBackground',
			'wordHighlightBorder',
			'wordHighlightStrongBackground',
			'wordHighlightStrongBorder',
		]);
		addThemeStyle(colors, 'editorGutter', [
			'background',
		]);
		addThemeStyle(colors, 'editorLineNumber', [
			'foreground',
			'activeForeground',
		]);
		addThemeStyle(colors, 'editorCursor', [
			'foreground',
		]);

		monaco.editor.defineTheme('myTheme', {
			base: 'vs',
			inherit: false,
			rules: [],
			colors: colors,
		});
	}
	updateTheme();
	monaco.editor.setTheme('myTheme');
	window.addEventListener('message', event => {
		const message = event.data; // The JSON data our extension sent
		// console.log("message:", message);
		switch (message.command) {
			case 'getText':
				vscode.postMessage({ command: 'response', data: editor.getValue() });
				break;
			case 'setText':
				editor.setValue(message.data);
				break;
			case 'setReadOnly':
				//console.log("setreadonly");
				editor.updateOptions({ readOnly: message.data || true });
				break;
			case 'themeChanged':
				updateTheme();
				break;
		}
	});
	editor.onDidChangeModelContent(function (event) {
		vscode.postMessage({ command: 'textChanged', data: editor.getValue() });
	});
});

function notifyLoad() {
	vscode.postMessage({ command: 'load' });
}