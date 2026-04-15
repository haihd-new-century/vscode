/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ansiColors from 'ansi-colors';
import * as cp from 'child_process';
import es from 'event-stream';
import fancyLog from 'fancy-log';
import * as path from 'path';

const root = path.dirname(path.dirname(import.meta.dirname));
const tsgoBin = process.platform === 'win32'
	? path.join(root, 'node_modules', '.bin', 'tsgo.cmd')
	: path.join(root, 'node_modules', '.bin', 'tsgo');
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const timestampRegex = /^\[\d{2}:\d{2}:\d{2}\]\s*/;

// Limit concurrent tsgo spawns — the native Go compiler deadlocks/crashes under
// high parallelism on Windows (observed with 40+ concurrent extension compiles).
const MAX_CONCURRENT_TSGO = Number(process.env.TSGO_MAX_CONCURRENT) || 4;
let tsgoActive = 0;
const tsgoQueue: Array<() => void> = [];
function acquireTsgoSlot(): Promise<void> {
	return new Promise(resolve => {
		const tryAcquire = () => {
			if (tsgoActive < MAX_CONCURRENT_TSGO) {
				tsgoActive++;
				resolve();
			} else {
				tsgoQueue.push(tryAcquire);
			}
		};
		tryAcquire();
	});
}
function releaseTsgoSlot(): void {
	tsgoActive--;
	const next = tsgoQueue.shift();
	if (next) { next(); }
}

export function spawnTsgo(projectPath: string, config: { taskName: string; noEmit?: boolean }, onComplete?: () => Promise<void> | void): Promise<void> {
	function runReporter(output: string) {
		const lines = (output || '').split('\n');
		const errorLines = lines.filter(line => /error \w+:/.test(line));
		if (errorLines.length > 0) {
			fancyLog(`Finished ${ansiColors.green(config.taskName)} ${projectPath} with ${errorLines.length} errors.`);
			for (const line of errorLines) {
				fancyLog(line);
			}
		}
	}

	const args = ['--project', projectPath, '--pretty', 'false'];
	if (config.noEmit) {
		args.push('--noEmit');
	} else {
		args.push('--sourceMap', '--inlineSources');
	}

	return acquireTsgoSlot().then(() => new Promise<void>((resolve, reject) => {
		const child = cp.spawn(tsgoBin, args, {
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true
		});

		let stdoutData = '';
		let stderrData = '';

		child.stdout?.on('data', (data: Buffer) => {
			stdoutData += data.toString();
		});
		child.stderr?.on('data', (data: Buffer) => {
			stderrData += data.toString();
		});

		child.on('exit', code => {
			releaseTsgoSlot();
			const allOutput = stdoutData + '\n' + stderrData;
			const lines = allOutput
				.split(/\r?\n/)
				.map(line => line.replace(ansiRegex, '').trim())
				.map(line => line.replace(timestampRegex, ''))
				.filter(line => line.length > 0)
				.filter(line => !/Starting compilation|File change detected|Compilation complete/i.test(line));

			runReporter(lines.join('\n'));

			if (code === 0) {
				Promise.resolve(onComplete?.()).then(() => resolve(), reject);
			} else {
				fancyLog(`${ansiColors.red('tsgo FULL OUTPUT for')} ${projectPath}:\n${allOutput}`);
				reject(new Error(`tsgo exited with code ${code ?? 'unknown'} (project: ${projectPath})`));
			}
		});

		child.on('error', err => {
			releaseTsgoSlot();
			reject(err);
		});
	}));
}

export function createTsgoStream(projectPath: string, config: { taskName: string; noEmit?: boolean }, onComplete?: () => Promise<void> | void): NodeJS.ReadWriteStream {
	const stream = es.through();

	spawnTsgo(projectPath, config, onComplete).then(() => {
		stream.emit('end');
	}).catch(err => {
		stream.emit('error', err);
	});

	return stream;
}
