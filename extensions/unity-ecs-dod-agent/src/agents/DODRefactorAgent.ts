import { LLMRouter } from '../llm/LLMRouter';

export interface RefactorResult {
	refactoredCode: string;
	components: string[];
	systems: string[];
	migrationNotes: string[];
	rawResponse: string;
}

export class DODRefactorAgent {
	constructor(private llmRouter: LLMRouter) { }

	async refactorOOPtoECS(oopCode: string): Promise<RefactorResult> {
		const response = await this.llmRouter.send({
			prompt: `Convert this Unity MonoBehaviour to ECS (DOTS):\n\`\`\`csharp\n${oopCode}\n\`\`\`\n\nMapping:\n- MonoBehaviour fields → IComponentData\n- Update() → ISystem + [BurstCompile] IJobEntity\n- GetComponent<T>() → SystemAPI.GetComponent<T>(entity)\n- Instantiate() → EntityManager.Instantiate(prefab)\n- Destroy() → EntityManager.DestroyEntity(entity)\n- Coroutine → state enum + system\n- static field → singleton IComponentData\n- transform.position → LocalTransform.Position\n\nOutput all IComponentData structs + ISystem, then:\n\`\`\`json\n{"components": [], "systems": [], "migrationNotes": []}\n\`\`\``,
			systemPrompt: 'Unity ECS migration expert. Output complete compilable C# ECS code. No placeholders.',
			complexity: 'high'
		});

		const codeBlocks = [...response.text.matchAll(/```(?:csharp|cs)?([\s\S]*?)```/g)];
		const jsonMatch = response.text.match(/```json([\s\S]*?)```/);
		let components: string[] = [], systems: string[] = [], migrationNotes: string[] = [];

		try {
			if (jsonMatch) {
				const p = JSON.parse(jsonMatch[1].trim());
				components = p.components ?? [];
				systems = p.systems ?? [];
				migrationNotes = p.migrationNotes ?? [];
			}
		} catch { /* ignore */ }

		const code = codeBlocks
			.filter((b: any) => !b[0].startsWith('```json'))
			.map((b: any) => b[1].trim())
			.join('\n\n') || response.text;

		return { refactoredCode: code, components, systems, migrationNotes, rawResponse: response.text };
	}
}
