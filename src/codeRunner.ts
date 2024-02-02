import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProblemsItem } from './problemsExplorer';
import { CaseGroup, CaseNode } from './caseView';
import {spawn} from 'child_process';

function runSubprocess(command: string, args: string[], timeoutSec: number, memoryLimitMB: number): Promise<{ code: number | null, message: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, { stdio: 'inherit' });

        // Set resource limits for time and memory
        const timeoutId = setTimeout(() => {
            child.kill();
            resolve({ code: null, message: 'Timeout expired' });
        }, timeoutSec * 1000);

        child.on('exit', (code) => {
            clearTimeout(timeoutId);
            resolve({ code, message: `Process exited with code ${code}` });
        });
    });
}

function compile(sourceFile:string,dstFile:string){
	return new Promise((resolve)=>{
		const compiler = spawn('g++', [sourceFile, '-o', dstFile]);
		compiler.on('exit', (code) => {
			resolve(code);
		});
	});
}