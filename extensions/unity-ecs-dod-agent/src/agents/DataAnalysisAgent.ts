import { LLMRouter, LLMResponse } from '../llm/LLMRouter';

export interface ComponentSchema {
  name: string;
  fields: { name: string; type: string }[];
  tag: 'Hot' | 'Cold' | 'Shared' | 'Enableable';
  notes?: string;
}

export interface DataAnalysisResult {
  components: ComponentSchema[];
  hotData: string[];
  coldData: string[];
  warnings: string[];
  rawResponse: string;
}

const SYSTEM_PROMPT = `You are a Unity DOTS/ECS expert specializing in Data-Oriented Design (DOD).
Always respond with valid JSON matching the requested schema.
Prioritize blittable types (float, int, bool, float3, quaternion).
Flag managed types (string, class, array) as warnings.`;

export class DataAnalysisAgent {
  constructor(private llmRouter: LLMRouter) {}

  async analyzeGameplayFeatures(input: string): Promise<DataAnalysisResult> {
    const prompt = `Analyze these gameplay features and design Unity ECS IComponentData structs:

Features:
${input}

Respond with JSON in this exact schema:
{
  "components": [
    {
      "name": "ComponentName",
      "fields": [{"name": "fieldName", "type": "float3"}],
      "tag": "Hot|Cold|Shared|Enableable",
      "notes": "optional explanation"
    }
  ],
  "hotData": ["list of hot component names (accessed every frame)"],
  "coldData": ["list of cold component names (rare access)"],
  "warnings": ["any DOD concerns, managed types, archetype churn risks"]
}

Rules:
1. Separate hot data (position, velocity) from cold data (stats, config)
2. Flag any managed types (string, class, List<>) as warnings
3. Suggest EnableableComponent for frequently toggled states
4. Use float3 for positions/velocities, quaternion for rotations
5. Keep components small and focused (Single Responsibility)`;

    const response = await this.llmRouter.send({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      preferLocal: true,
      complexity: 'medium'
    });

    return this.parseResponse(response);
  }

  private parseResponse(response: LLMResponse): DataAnalysisResult {
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, rawResponse: response.text };
      }
    } catch (e) {
      console.error('DataAnalysisAgent: failed to parse JSON response', e);
    }
    return {
      components: [],
      hotData: [],
      coldData: [],
      warnings: ['Failed to parse LLM response. Raw response stored.'],
      rawResponse: response.text
    };
  }
}