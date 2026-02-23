import * as fs from 'fs';
import * as path from 'path';

export interface ComponentInfo {
	name: string;
	file: string;
	isManaged: boolean;
}

export interface SystemInfo {
	name: string;
	file: string;
	type: 'ISystem' | 'SystemBase';
	hasBurstCompile: boolean;
}

export interface ProjectContext {
	projectPath: string;
	components: ComponentInfo[];
	systems: SystemInfo[];
}

export interface Violation {
	file: string;
	type: 'ManagedComponent' | 'MissingBurst' | 'DeprecatedAPI';
	message: string;
}

export class UnityProjectAnalyzer {
	async scanProject(projectPath: string): Promise<ProjectContext> {
		const context: ProjectContext = { projectPath, components: [], systems: [] };
		this.scanDirectory(projectPath, context);
		return context;
	}

	detectDODViolations(context: ProjectContext): Violation[] {
		const violations: Violation[] = [];
		for (const c of context.components) {
			if (c.isManaged) {
				violations.push({ file: c.file, type: 'ManagedComponent', message: `${c.name}: contains managed types. Replace with blittable types or FixedString/FixedList.` });
			}
		}
		for (const s of context.systems) {
			if (!s.hasBurstCompile) {
				violations.push({ file: s.file, type: 'MissingBurst', message: `${s.name}: missing [BurstCompile]. Add it for significant performance gains.` });
			}
			if (s.type === 'SystemBase') {
				violations.push({ file: s.file, type: 'DeprecatedAPI', message: `${s.name}: SystemBase is deprecated in DOTS 1.x. Migrate to ISystem.` });
			}
		}
		return violations;
	}

	private scanDirectory(dirPath: string, context: ProjectContext): void {
		const skip = new Set(['Library', 'Temp', 'obj', 'node_modules', '.git']);
		try {
			for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
				if (skip.has(entry.name)) { continue; }
				const fullPath = path.join(dirPath, entry.name);
				if (entry.isDirectory()) {
					this.scanDirectory(fullPath, context);
				} else if (entry.isFile() && entry.name.endsWith('.cs')) {
					this.analyzeFile(fullPath, context);
				}
			}
		} catch { /* skip permission errors */ }
	}

	private analyzeFile(filePath: string, context: ProjectContext): void {
		let content: string;
		try {
			content = fs.readFileSync(filePath, 'utf-8');
		} catch {
			return;
		}

		for (const match of content.matchAll(/public\s+struct\s+(\w+)\s*:\s*IComponentData/g)) {
			context.components.push({
				name: match[1],
				file: filePath,
				isManaged: /\bstring\b|\bList<|\bobject\b/.test(content)
			});
		}

		for (const match of content.matchAll(/public\s+partial\s+struct\s+(\w+)\s*:\s*ISystem/g)) {
			context.systems.push({ name: match[1], file: filePath, type: 'ISystem', hasBurstCompile: content.includes('[BurstCompile]') });
		}

		for (const match of content.matchAll(/public\s+(?:partial\s+)?class\s+(\w+)\s*:\s*SystemBase/g)) {
			context.systems.push({ name: match[1], file: filePath, type: 'SystemBase', hasBurstCompile: content.includes('[BurstCompile]') });
		}
	}
}
