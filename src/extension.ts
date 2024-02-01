import * as vscode from 'vscode';
import { CaseViewProvider } from './case'
import { ProblemsExplorerProvider, ProblemsItem } from './problemsExplorer'
export function activate(context: vscode.ExtensionContext) {
	const problemsExplorerProvider = new ProblemsExplorerProvider();
	vscode.window.registerTreeDataProvider('problemsExplorer', problemsExplorerProvider);
	vscode.commands.registerCommand('problemsExplorer.addProblem', () => {
		problemsExplorerProvider.addProblem();
	});
	vscode.commands.registerCommand('problemsExplorer.addProblemFromFolder', () => { });
	vscode.commands.registerCommand('problemsExplorer.renameProblem', (element: ProblemsItem) => {
		problemsExplorerProvider.renameItem(element);
	});
	vscode.commands.registerCommand('problemsExplorer.deleteProblem', () => { });

	const caseViewProvider = new CaseViewProvider();
	vscode.window.registerTreeDataProvider('caseView', caseViewProvider);

	vscode.window.registerWebviewViewProvider("inputView", {
		resolveWebviewView(webviewView) {
			webviewView.webview.options = {
				enableScripts: true  // 启用脚本
			};

			// 在这里设置自定义视图的 HTML 内容、事件处理等
			webviewView.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
					<style>
						html, body, #editor {
							width: 100%;
							height: 100%;
							margin: 0;
							padding: 0;
							box-sizing: border-box;
						}
						.ql-container {
							border: none;!important  // 隐藏边框
						}
					</style>
				</head>
				<body>
				<div id="editor">
				<p>DevUI：面向企业中后台的前端开源解决方案</p>
				<h2>宗旨与法则</h2>
				<p>规范的组件化的目的不是为了限制创造，而是为了创造者更确定、科学、高效。所有行为决策的价值归依是产品业务。产品业务永远比组件化本身更重要，业务第一。</p>
				<p>规范不是绝对、教条、冷漠、强制的，实际工作中总会有新增需求、存优化空间、情感化设计需求超出一般通用规范。保持克制的同时，允许基于强烈业务需求的规范突破；之后如果有足够的理由迭代出组件，那么就进行组件深化。</p>
				<h2>设计语言</h2>
				<p>DevUI的价值观奠定了 DevCloud品牌的基础。它是 DevCloud 的设计师们思考、工作的产物，反映了 DevCloud 的产品文化、设计理念和对客户的承诺。DevUI的这些价值观贯穿于所有产品和面向客户的沟通和内容中。同时，它是 DevUI 设计原则的源头，为具体的设计方法提供启发和指引。</p>
				<p>DevUI倡导<code>沉浸</code>、<code>灵活</code>、<code>致简</code>的设计价值观，提倡设计者为真实的需求服务，为多数人的设计，拒绝哗众取宠、取悦眼球的设计。</p>
				<h2>致简</h2>
				<p>DevUI坚持以用户为中心去进行设计，注重直观可达性，把服务示例化以帮助用户快速融入到使用中去。同时， DevUI提供大量的快捷键，简化使用的流程、提高操作效率。</p>
				<h2>沉浸</h2>
				<p>DevUI的沉浸式体验包括人的感官体验和认知体验，当用户的个人技能与面对的挑战互相匹配，并且长时间处在稳定状态时，用户达到心流状态并且不易被外界因素所干扰。</p>
				<p>在产品设计中，DevUI专注在降低用户在完成任务目标时的认知阻力中。为此，DevUI同时提供多种不同的切换页面的途径，包括面包屑、快捷键、按钮和链接等，方便用户随时快速、连续地切换页面，到达自己所需的页面，使用户处于流畅的体验中，减轻寻找信息的焦虑感。</p>
				<h2>灵活</h2>
				<p>DevUI提供超过60个独立原子级组件，可以自由组合，像搭积木一样，用小组件搭建出符合自身产品需要的分子级组件，进而搭建出自己的业务系统。</p>
			  </div>
					<script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
					<script>
						var quill = new Quill('#editor', {
							theme: 'snow',
							modules:{
								toolbar: false
							}
						});
					</script>
				</body>
				</html>
			`;
		}
	}, {
		webviewOptions: {
			retainContextWhenHidden: true
		},
	});
}

export function deactivate() {

}
