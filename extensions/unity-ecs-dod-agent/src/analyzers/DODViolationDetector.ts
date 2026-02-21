import { ProjectContext, Violation } from './UnityProjectAnalyzer';

export class DODViolationDetector {
  detect(context: ProjectContext): Violation[] {
    return [
      ...this.detectManagedComponents(context),
      ...this.detectMissingBurst(context),
      ...this.detectDeprecatedAPIs(context)
    ];
  }

  private detectManagedComponents(context: ProjectContext): Violation[] {
    return context.components
      .filter(c => c.isManaged)
      .map(c => ({
        file: c.file,
        type: 'ManagedComponent' as const,
        message: `${c.name}: contains managed types. Replace with blittable types or FixedString/FixedList.`
      }));
  }

  private detectMissingBurst(context: ProjectContext): Violation[] {
    return context.systems
      .filter(s => !s.hasBurstCompile)
      .map(s => ({
        file: s.file,
        type: 'MissingBurst' as const,
        message: `${s.name}: missing [BurstCompile]. Add it for significant performance gains.`
      }));
  }

  private detectDeprecatedAPIs(context: ProjectContext): Violation[] {
    return context.systems
      .filter(s => s.type === 'SystemBase')
      .map(s => ({
        file: s.file,
        type: 'DeprecatedAPI' as const,
        message: `${s.name}: SystemBase is deprecated in DOTS 1.x. Migrate to ISystem.`
      }));
  }
}