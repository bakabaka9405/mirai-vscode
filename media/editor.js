const vscode = acquireVsCodeApi();
require.config({
	paths: {
		'vs': MonacoBaseUri
	}
});

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
		quickSuggestions: false
	});
	monaco.editor.defineTheme('myTheme', {
		base: 'vs-dark',  // 基于暗色主题
		inherit: true,  // 继承基主题的设置
		rules: [],  // 自定义的语法高亮规则
		colors: {
			'editor.background': '#24292e',
			'editorGutter.background': '#1f2428',
			'editor.lineHighlightBackground': '#2b3036'
		}
	});
	monaco.editor.setTheme('myTheme');
	window.addEventListener('message', event => {
		const message = event.data; // The JSON data our extension sent
		console.log("message:", message);
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
		}
	});
	editor.onDidChangeModelContent(function (event) {
		vscode.postMessage({ command: 'textChanged', data: editor.getValue() });
	});
});

function notifyLoad() {
	vscode.postMessage({ command: 'load' });
}