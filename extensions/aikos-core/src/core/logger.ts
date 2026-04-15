import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return outputChannel;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function logInfo(message: string, ...args: unknown[]): void {
  const ch = getOutputChannel();
  const extra = args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
  ch.appendLine(`[${timestamp()}] INFO  ${message}${extra}`);
}

export function logWarn(message: string, ...args: unknown[]): void {
  const ch = getOutputChannel();
  const extra = args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
  ch.appendLine(`[${timestamp()}] WARN  ${message}${extra}`);
}

export function logError(message: string, error?: unknown): void {
  const ch = getOutputChannel();
  const errStr = error instanceof Error ? error.message : String(error ?? '');
  ch.appendLine(`[${timestamp()}] ERROR ${message}${errStr ? ': ' + errStr : ''}`);
}

export function logDebug(message: string, ...args: unknown[]): void {
  const ch = getOutputChannel();
  const extra = args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
  ch.appendLine(`[${timestamp()}] DEBUG ${message}${extra}`);
}

export function disposeLogger(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
