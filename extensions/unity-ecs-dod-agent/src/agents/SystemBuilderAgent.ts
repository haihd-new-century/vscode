import { LLMRouter } from '../llm/LLMRouter';
import { ArchetypeBlueprint } from './ArchetypeDesignAgent';

export interface GeneratedSystemCode {
  fileName: string;
  code: string;
  provider: string;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are a Unity DOTS expert generating production-ready C# ECS systems for Unity 1.3+ DOTS.
Always use ISystem (not SystemBase) for Burst compatibility.
Always use IJobEntity for entity iteration.
Add [BurstCompile] where safe.
Use SystemAPI.Query<> with proper RefRW/RefRO.`;

export class SystemBuilderAgent {
  constructor(private llmRouter: LLMRouter) {}

  async generateSystem(archetype: ArchetypeBlueprint, systemDescription: string): Promise<GeneratedSystemCode> {
    const prompt = `Generate a complete Unity ECS ISystem in C# for Unity DOTS 1.3+.

Available archetype:
Name: ${archetype.name}
Components: ${archetype.components.join(', ')}

System goal: ${systemDescription}

Requirements:
- Use ISystem interface (not SystemBase)
- Use IJobEntity for main iteration loop
- Add [BurstCompile] to the system struct and job struct
- Use SystemAPI.Query<RefRW<...>, RefRO<...>>() pattern
- Add EntityQuery in OnCreate with ComponentType.ReadOnly where applicable
- Use RequireForUpdate<> for optional dependencies
- Add proper XML documentation comments
- Follow Unity DOTS 1.3+ API (not deprecated Entities.ForEach)

Output ONLY the C# code, no explanation.`;

    const response = await this.llmRouter.send({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      preferLocal: false,
      complexity: 'high'
    });

    const systemName = this.extractSystemName(response.text, systemDescription);
    return {
      fileName: `${systemName}.cs`,
      code: response.text,
      provider: response.provider,
      warnings: this.detectIssues(response.text)
    };
  }

  private extractSystemName(code: string, fallback: string): string {
    const match = code.match(/public\s+partial\s+struct\s+(\w+System)/);
    if (match) return match[1];
    return fallback.replace(/\s+/g, '') + 'System';
  }

  private detectIssues(code: string): string[] {
    const warnings: string[] = [];
    if (code.includes('SystemBase')) warnings.push('Consider using ISystem instead of SystemBase for Burst compatibility');
    if (code.includes('Entities.ForEach')) warnings.push('Entities.ForEach is deprecated. Use IJobEntity instead');
    if (!code.includes('[BurstCompile]')) warnings.push('Missing [BurstCompile] attribute');
    return warnings;
  }
}