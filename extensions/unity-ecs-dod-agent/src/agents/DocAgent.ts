import { LLMRouter } from '../llm/LLMRouter';
import { DataAnalysisResult } from './DataAnalysisAgent';
import { GeneratedSystemCode } from './SystemBuilderAgent';

export interface DocResult {
	markdown: string;
	rawResponse: string;
}

export class DocAgent {
	constructor(private llmRouter: LLMRouter) { }

	async generateComponentDocs(dataResult: DataAnalysisResult): Promise<DocResult> {
		const componentList = dataResult.components
			.map(c => `### ${c.name} [${c.tag}]\nFields: ${c.fields.map(f => `${f.type} ${f.name}`).join(', ')}\n${c.notes ?? ''}`)
			.join('\n\n');

		const response = await this.llmRouter.send({
			prompt: `Generate Markdown docs for these Unity ECS IComponentData structs:\n\n${componentList}\n\nInclude: purpose, memory layout table, usage example, DOD rationale.`,
			systemPrompt: 'You are a Unity DOTS technical writer. Generate clear Markdown documentation.',
			complexity: 'medium'
		});

		return { markdown: response.text, rawResponse: response.text };
	}

	async generateSystemDocs(systemResult: GeneratedSystemCode): Promise<DocResult> {
		const response = await this.llmRouter.send({
			prompt: `Generate Markdown docs for this Unity ECS system:\n\n\`\`\`csharp\n${systemResult.code.substring(0, 3000)}\n\`\`\`\n\nInclude: purpose, update group, components read/written, performance notes, usage example.`,
			systemPrompt: 'You are a Unity DOTS technical writer. Generate clear Markdown documentation.',
			complexity: 'medium'
		});

		return { markdown: response.text, rawResponse: response.text };
	}
}
