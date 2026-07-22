import * as fs from 'fs';

export type OutputSource = 'stdout' | 'stderr';

export interface IOutputChunk {
    source: OutputSource;
    text: string;
}

/**
 * 测试样例数据模型
 * 与 VS Code API 解耦的纯数据类
 */
export interface ITestCase {
    name: string;
    enabled: boolean;
    external: boolean;
    input: string;
    output: string;
    expectedOutput: string;
}

export interface ITestResult {
    status: TestStatus;
    time?: number;
    memory?: number;
    message?: string;
}

export enum TestStatus {
    Pending = 'pending',
    Running = 'running',
    Accepted = 'accepted',
    WrongAnswer = 'wrong_answer',
    RuntimeError = 'runtime_error',
    TimeLimitExceeded = 'time_limit_exceeded',
    MemoryLimitExceeded = 'memory_limit_exceeded',
    Cancelled = 'cancelled'
}

export class TestCase implements ITestCase {
    private _input: string = '';
    private _expectedOutput: string = '';
    public output: string = '';
    public result?: ITestResult;
    public outputChunks: IOutputChunk[] = [];

    constructor(
        public name: string,
        public enabled: boolean = true,
        public external: boolean = false,
        input: string = '',
        output: string = '',
        expectedOutput: string = ''
    ) {
        this._input = input;
        this.output = output;
        this._expectedOutput = expectedOutput;
        // 非空旧 output 视为一个 stdout chunk
        if (this.output) {
            this.outputChunks = [{ source: 'stdout', text: this.output }];
        }
    }

    get input(): string {
        if (!this.external) { return this._input; }
        try {
            return fs.readFileSync(this._input, 'utf-8');
        } catch {
            return '';
        }
    }

    set input(value: string) {
        if (!this.external) {
            this._input = value;
        } else if (fs.existsSync(this._input)) {
            fs.writeFileSync(this._input, value, 'utf-8');
        }
    }

    get expectedOutput(): string {
        if (!this.external) { return this._expectedOutput; }
        try {
            return fs.readFileSync(this._expectedOutput, 'utf-8');
        } catch {
            return '';
        }
    }

    set expectedOutput(value: string) {
        if (!this.external) {
            this._expectedOutput = value;
        } else if (fs.existsSync(this._expectedOutput)) {
            fs.writeFileSync(this._expectedOutput, value, 'utf-8');
        }
    }

    get inputPath(): string {
        return this.external ? this._input : '';
    }

    get expectedOutputPath(): string {
        return this.external ? this._expectedOutput : '';
    }

    toJSON(): object {
        return {
            name: this.name,
            enabled: this.enabled,
            external: this.external,
            input: this._input,
            expectedOutput: this._expectedOutput
        };
    }

    static fromJSON(json: any): TestCase {
        return new TestCase(
            json.name || 'undefined',
            json.enabled ?? true,
            json.external ?? false,
            json.input || '',
            '',
            json.expectedOutput || ''
        );
    }
}
