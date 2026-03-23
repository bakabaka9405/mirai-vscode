import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { TestCase, TestStatus, ITestResult, LanguagePreset } from '../core/models';
import { LanguageHandlerRegistry } from '../core/handlers';
import { ConfigService } from './ConfigService';
import { CompilerService } from './CompilerService';

/**
 * 运行服务 - 处理多语言代码运行和测试
 */
export class RunnerService {
    private static instance: RunnerService;
    private config: ConfigService;
    private compiler: CompilerService;
    private registry: LanguageHandlerRegistry;
    private runningProcess?: ChildProcess;

    private _onStopRunning = new vscode.EventEmitter<void>();
    public readonly onStopRunning = this._onStopRunning.event;

    private constructor() {
        this.config = ConfigService.getInstance();
        this.compiler = CompilerService.getInstance();
        this.registry = this.compiler.getRegistry();
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

    /**
     * 运行测试
     * 
     * @param preset 语言预设
     * @param testCase 测试用例
     * @param token 取消令牌
     * @returns 测试结果
     */
    async runTest(
        preset: LanguagePreset,
        testCase: TestCase,
        token: vscode.CancellationToken
    ): Promise<ITestResult> {
        const srcFile = this.getCurrentFile();
        if (!srcFile) {
            return { status: TestStatus.Cancelled, message: '未打开文件' };
        }

        const handler = this.registry.getHandler(preset.languageId);
        if (!handler) {
            return { 
                status: TestStatus.RuntimeError, 
                message: `不支持的语言: ${preset.languageId}` 
            };
        }

        const basePath = this.config.srcBasePath;
        const outputPath = this.config.buildBasePath;

        // 获取运行命令
        const runCommand = handler.getRunCommand(srcFile, preset, basePath, outputPath);

        return this.runTestImpl(runCommand, testCase, preset, token);
    }

    /**
     * 执行测试
     */
    private async runTestImpl(
        runCommand: { command: string; args: string[]; cwd?: string },
        testCase: TestCase,
        preset: LanguagePreset,
        token: vscode.CancellationToken
    ): Promise<ITestResult> {
        return new Promise(resolve => {
            let output = '';
            let startTime: bigint;
            let maxMemory = 0;

            const child = spawn(runCommand.command, runCommand.args, { 
                windowsHide: true,
                cwd: runCommand.cwd
            });
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
