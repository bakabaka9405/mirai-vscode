import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { TestPreset, TestCase, TestStatus, ITestResult } from '../core/models';
import { ConfigService } from './ConfigService';
import { CompilerService } from './CompilerService';

/**
 * 运行服务 - 处理代码运行和测试
 */
export class RunnerService {
    private static instance: RunnerService;
    private config: ConfigService;
    private compiler: CompilerService;
    private runningProcess?: ChildProcess;

    private _onStopRunning = new vscode.EventEmitter<void>();
    public readonly onStopRunning = this._onStopRunning.event;

    private constructor() {
        this.config = ConfigService.getInstance();
        this.compiler = CompilerService.getInstance();
    }

    static getInstance(): RunnerService {
        if (!RunnerService.instance) {
            RunnerService.instance = new RunnerService();
        }
        return RunnerService.instance;
    }

    stopRunning(): void {
        this.runningProcess?.kill();
        this._onStopRunning.fire();
    }

    async runTest(
        preset: TestPreset,
        testCase: TestCase,
        token: vscode.CancellationToken
    ): Promise<ITestResult> {
        const srcFile = this.getCurrentFile();
        if (!srcFile) {
            return { status: TestStatus.Cancelled, message: '未打开文件' };
        }

        const execFile = preset.getExecutableFile(
            srcFile,
            this.config.srcBasePath,
            this.config.buildBasePath
        );

        return this.executeTest(execFile, testCase, preset, token);
    }

    private async executeTest(
        execFile: string,
        testCase: TestCase,
        preset: TestPreset,
        token: vscode.CancellationToken
    ): Promise<ITestResult> {
        return new Promise(resolve => {
            let output = '';
            let startTime: bigint;
            let maxMemory = 0;

            const child = spawn(execFile, [], { windowsHide: true });
            this.runningProcess = child;

            const timeoutId = preset.timeoutSec > 0 ? setTimeout(() => {
                child.kill();
                testCase.output = output;
                resolve({
                    status: TestStatus.TimeLimitExceeded,
                    time: preset.timeoutSec * 1000,
                    memory: maxMemory
                });
            }, preset.timeoutSec * 1000) : undefined;

            child.on('spawn', () => {
                startTime = process.hrtime.bigint();
            });

            const stopListener = this.onStopRunning(() => {
                child.kill();
                stopListener.dispose();
                testCase.output = output;
                resolve({ status: TestStatus.Cancelled });
            });

            token.onCancellationRequested(() => {
                child.kill();
                testCase.output = output;
                resolve({ status: TestStatus.Cancelled });
            });

            child.on('exit', code => {
                clearTimeout(timeoutId);
                const time = Number(process.hrtime.bigint() - startTime) / 1e6;
                testCase.output = output;

                if (code === 0) {
                    const isCorrect = this.compareOutput(output, testCase.expectedOutput);
                    resolve({
                        status: isCorrect ? TestStatus.Accepted : TestStatus.WrongAnswer,
                        time,
                        memory: maxMemory
                    });
                } else {
                    resolve({
                        status: TestStatus.RuntimeError,
                        time,
                        message: `Exit code: ${code}`
                    });
                }
            });

            child.on('error', error => {
                clearTimeout(timeoutId);
                testCase.output = output;
                resolve({
                    status: TestStatus.RuntimeError,
                    message: error.message
                });
            });

            if (testCase.input) {
                child.stdin.write(testCase.input);
                child.stdin.end();
                startTime = process.hrtime.bigint();
            }

            child.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });

            if (preset.mixStdoutStderr) {
                child.stderr.on('data', (data: Buffer) => {
                    output += data.toString();
                });
            }
        });
    }

    private compareOutput(output: string, expected: string): boolean {
        const normalize = (s: string) => 
            s.split('\n').map(line => line.trimEnd()).join('\n').trimEnd();
        return normalize(output) === normalize(expected);
    }

    private getCurrentFile(): string | undefined {
        return vscode.window.activeTextEditor?.document.fileName;
    }

    dispose(): void {
        this._onStopRunning.dispose();
    }
}
