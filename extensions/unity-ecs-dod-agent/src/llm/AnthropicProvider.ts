import * as vscode from 'vscode';
import { ILLMProvider, LLMRequest, LLMResponse } from './LLMRouter';

export class AnthropicProvider implements ILLMProvider {
  name = 'Anthropic Claude';
  private model: string;

  constructor(config: any) {
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  async isAvailable(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Anthropic API key not configured');
    const messages: any[] = [{ role: 'user', content: request.prompt }];
    const body: any = { model: request.model || this.model, max_tokens: 4096, messages };
    if (request.systemPrompt) body.system = request.systemPrompt;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json() as any;
    return { text: data.content[0].text, provider: this.name, model: this.model };
  }

  private async getApiKey(): Promise<string | undefined> {
    return vscode.workspace.getConfiguration('unityDOD').get<string>('llm.anthropic.apiKey') ||
      process.env['ANTHROPIC_API_KEY'];
  }
}