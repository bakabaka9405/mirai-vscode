import { Problem, TestCase } from '../core/models';
import * as vscode from 'vscode';

/**
 * HTTP 监听服务 - 接收 Competitive Companion 数据
 */
export class ListenerService {
    private static instance: ListenerService;
    private server: any;
    private readonly port = 10043;

    private _onProblemReceived = new vscode.EventEmitter<Problem>();
    public readonly onProblemReceived = this._onProblemReceived.event;

    private constructor() {}

    static getInstance(): ListenerService {
        if (!ListenerService.instance) {
            ListenerService.instance = new ListenerService();
        }
        return ListenerService.instance;
    }

    start(): void {
        if (this.server) { return; }

        const express = require('express');
        const bodyParser = require('body-parser');
        const app = express();

        app.use(bodyParser.json());

        app.post('/', (req: any, res: any) => {
            const data = req.body;
            const problem = this.parseProblem(data);
            this._onProblemReceived.fire(problem);
            res.sendStatus(200);
        });

        this.server = app.listen(this.port, (err: any) => {
            if (err) {
                console.error('Failed to start listener:', err);
                return;
            }
            console.log(`Mirai-vscode is listening on port ${this.port}`);
        });
    }

    private parseProblem(data: any): Problem {
        const problem = new Problem(data.name, undefined, data.url);
        
        let count = 0;
        problem.cases = (data.tests || []).map((test: any) => {
            return new TestCase(
                `Case ${++count}`,
                true,
                false,
                test.input || '',
                '',
                test.output || ''
            );
        });

        // 存储 group 信息用于后续处理
        (problem as any).group = data.group;
        
        return problem;
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = undefined;
        }
    }

    dispose(): void {
        this.stop();
        this._onProblemReceived.dispose();
    }
}
