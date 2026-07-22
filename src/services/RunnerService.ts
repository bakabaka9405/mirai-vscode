import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { TestCase, TestStatus, ITestResult, LanguagePreset, IOutputChunk } from '../core/models';
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
        srcFile: string,
        preset: LanguagePreset,
        testCase: TestCase,
        token: vscode.CancellationToken
    ): Promise<ITestResult> {
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
            let startTime = process.hrtime.bigint();
            let maxMemory = 0;
            const outputChunks: IOutputChunk[] = [];

            // 保存 output 与 outputChunks 快照的局部 helper
            const saveOutput = () => {
                testCase.output = output;
                testCase.outputChunks = [...outputChunks];
            };

            let forced: ITestResult | null = null;   // 首个强制结果
            let spawnError: Error | null = null;
            let settled = false;

            const child = spawn(runCommand.command, runCommand.args, { 
                windowsHide: true,
                cwd: runCommand.cwd
            });
            this.runningProcess = child;

            // --- 超时：记录并 kill，由 close 结算 ---
            const timeoutId = preset.timeoutSec > 0 ? setTimeout(() => {
                if (!forced) {
                    forced = {
                        status: TestStatus.TimeLimitExceeded,
                        time: preset.timeoutSec * 1000,
                        memory: maxMemory
                    };
                }
                child.kill();
            }, preset.timeoutSec * 1000) : undefined;

            // --- Runner stop：记录并 kill，由 close 结算 ---
            const stopListener = this.onStopRunning(() => {
                if (!forced) {
                    forced = { status: TestStatus.Cancelled };
                }
                child.kill();
            });

            // --- CancellationToken：记录并 kill，由 close 结算 ---
            const cancelListener = token.onCancellationRequested(() => {
                if (!forced) {
                    forced = { status: TestStatus.Cancelled };
                }
                child.kill();
            });

            // --- spawn 后重新计时 ---
            child.on('spawn', () => {
                startTime = process.hrtime.bigint();
            });

            // --- spawn 失败：记录错误，由 close 结算 ---
            child.on('error', error => {
                spawnError = error;
            });

            // --- close：唯一结算点，保证所有 stdio data 已处理 ---
            child.on('close', () => {
                if (settled) { return; }
                settled = true;

                clearTimeout(timeoutId);
                stopListener.dispose();
                cancelListener.dispose();
                if (this.runningProcess === child) {
                    this.runningProcess = undefined;
                }

                saveOutput();

                // 强制结果优先
                if (forced) {
                    resolve(forced);
                    return;
                }

                // spawn 失败
                if (spawnError) {
                    resolve({
                        status: TestStatus.RuntimeError,
                        message: spawnError.message
                    });
                    return;
                }

                // 正常 exit 判题
                const code = child.exitCode;
                const time = Number(process.hrtime.bigint() - startTime) / 1e6;

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

            // --- stdin：始终发送 EOF，空输入也不例外 ---
            child.stdin.end(testCase.input);

            // --- stdout/stderr 以 utf8 编码监听，按 Node data 回调顺序 push chunk ---
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (data: string) => {
                outputChunks.push({ source: 'stdout', text: data });
                output += data;
            });

            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (data: string) => {
                outputChunks.push({ source: 'stderr', text: data });
            });
        });
    }

    private compareOutput(output: string, expected: string): boolean {
        const normalize = (s: string) => 
            s.split('\n').map(line => line.trimEnd()).join('\n').trimEnd();
        return normalize(output) === normalize(expected);
    }

    dispose(): void {
        this._onStopRunning.dispose();
    }
}
