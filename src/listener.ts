import { ProblemsExplorerProvider, ProblemsItem } from "./problemsExplorer";
import { CaseList, CaseNode } from "./caseView";
import * as vscode from 'vscode';
export function startListen(problemsExplorerProvider: ProblemsExplorerProvider) {
	const app = require('express')();
	const bodyParser = require('body-parser');

	const port = 10043;

	app.use(bodyParser.json());

	app.post('/', (req: { body: any; }, res: { sendStatus: (arg0: number) => void; }) => {
		const data = req.body;

		//console.log(`Problem name: ${data.name}`);
		//console.log(`Problem group: ${data.group}`);
		//console.log('Full body:');
		//console.log(JSON.stringify(data, null, 4));
		let cnt = 0;
		let p = new ProblemsItem(data.name, undefined, data.url);
		p.cases!.data = data.tests.map((c: any) => {
			return new CaseNode("Case " + (++cnt), vscode.TreeItemCollapsibleState.None, undefined, c.input, "", c.output);
		});

		problemsExplorerProvider.problemsRoot.getFolderOrCreate(data.group).push(p);
		problemsExplorerProvider.refresh();
		res.sendStatus(200);
	});

	app.listen(port, (err: any) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}

		console.log(`Mirai-vscode is listening on port ${port}`);
	});
}