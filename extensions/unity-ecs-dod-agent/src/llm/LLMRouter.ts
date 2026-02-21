import * as vscode from 'vscode';
import { OllamaProvider } from './OllamaProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GroqProvider } from './GroqProvider';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  preferLocal?: boolean;
  complexity?: 'low' | 'medium' | 'high';
  privacySensitive?: boolean;
  model?: string;
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
}

export interface ILLMProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMRouter {
  private ollama: OllamaProvider;
  private openai: OpenAIProvider;
  private anthropic: AnthropicProvider;
  private groq: GroqProvider;

  constructor() {
    const config = vscode.workspace.getConfiguration('unityDOD');
    this.ollama = new OllamaProvider(config.get<any>('llm.ollama', {}));
    this.openai = new OpenAIProvider(config.get<any>('llm.openai', {}));
    this.anthropic = new AnthropicProvider(config.get<any>('llm.anthropic', {}));
    this.groq = new GroqProvider(config.get<any>('llm.groq', {}));
  }

  async send(request: LLMRequest): Promise<LLMResponse> {
    const config = vscode.workspace.getConfiguration('unityDOD');
    const providersCfg = config.get<any>('llm.providers', {});
    const privacyMode = providersCfg.privacyMode ?? true;
    const chain = this.buildProviderChain(request, privacyMode);
    for (const provider of chain) {
      try {
        const available = await provider.isAvailable();
        if (!available) continue;
        return await provider.complete(request);
      } catch (err) {
        console.warn(`LLMRouter: provider ${provider.name} failed:`, err);
      }
    }
    throw new Error('All LLM providers failed. Please check your configuration.');
  }

  private buildProviderChain(request: LLMRequest, privacyMode: boolean): ILLMProvider[] {
    if (privacyMode || request.privacySensitive || request.preferLocal) {
      return [this.ollama, this.groq, this.openai, this.anthropic];
    }
    if (request.complexity === 'high') {
      return [this.openai, this.anthropic, this.ollama, this.groq];
    }
    return [this.ollama, this.groq, this.openai, this.anthropic];
  }
}