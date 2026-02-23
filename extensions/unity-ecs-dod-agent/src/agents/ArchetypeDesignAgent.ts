import { LLMRouter } from '../llm/LLMRouter';
import { ComponentSchema } from './DataAnalysisAgent';

export interface ArchetypeBlueprint {
  name: string;
  components: string[];
  estimatedChunkFillRate: number;
  notes: string;
  warnings: string[];
}

export interface ArchetypeDesignResult {
  archetypes: ArchetypeBlueprint[];
  sharedComponents: string[];
  warnings: string[];
  rawResponse: string;
}

const SYSTEM_PROMPT = `You are a Unity ECS performance specialist.
Design archetypes that maximize chunk utilization (target >80%) and minimize structural changes.
Always respond with valid JSON.`;

export class ArchetypeDesignAgent {
  constructor(private llmRouter: LLMRouter) {}

  async designArchetypes(components: ComponentSchema[]): Promise<ArchetypeDesignResult> {
    const prompt = `Design optimal Unity ECS archetypes from these components:

Components:
${JSON.stringify(components, null, 2)}

Respond with JSON:
{
  "archetypes": [
    {
      "name": "PlayerArchetype",
      "components": ["Position", "Velocity", "Health"],
      "estimatedChunkFillRate": 0.85,
      "notes": "Core player archetype",
      "warnings": []
    }
  ],
  "sharedComponents": ["RenderMeshArray"],
  "warnings": ["global warnings"]
}

Rules:
1. Group hot components that are always accessed together
2. Use EnableableComponent instead of add/remove for toggleable states
3. Keep archetypes minimal -- avoid mixing hot and cold data
4. Estimate chunk fill rate (16KB chunk / sum of component sizes)
5. Suggest ISharedComponentData for groupings (render meshes, teams, etc.)
6. Warn about potential archetype churn sources`;

    const response = await this.llmRouter.send({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      preferLocal: true,
      complexity: 'medium'
    });

    return this.parseResponse(response);
  }

  private parseResponse(response: any): ArchetypeDesignResult {
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, rawResponse: response.text };
      }
    } catch (e) {
      console.error('ArchetypeDesignAgent: failed to parse JSON', e);
    }
    return { archetypes: [], sharedComponents: [], warnings: [], rawResponse: response.text };
  }
}