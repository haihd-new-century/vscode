import * as vscode from 'vscode';
import { ILLMProvider, LLMRequest, LLMResponse } from './LLMRouter';

export class OpenAIProvider implements ILLMProvider {
  name = 'OpenAI';
  private model: string;

  constructor(config: any) {
    this.model = config.model || 'gpt-4o';
  }

  async isAvailable(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('OpenAI API key not configured');
    const messages: any[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: request.model || this.model, messages })
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json() as any;
    return { text: data.choices[0].message.content, provider: this.name, model: this.model };
  }

  private async getApiKey(): Promise<string | undefined> {
    return vscode.workspace.getConfiguration('unityDOD').get<string>('llm.openai.apiKey') ||
      process.env['OPENAI_API_KEY'];
  }
}