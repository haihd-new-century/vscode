import { EventEmitter } from 'events';

export type AikosEvent =
  | 'connection:changed'
  | 'approval:new'
  | 'approval:resolved'
  | 'task:updated'
  | 'task:completed'
  | 'chat:chunk'
  | 'chat:done'
  | 'config:changed'
  | 'cost:updated';

class AikosEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(30);
  }

  fire(event: AikosEvent, data?: unknown): void {
    this.emit(event, data);
  }

  on(event: AikosEvent, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  once(event: AikosEvent, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  off(event: AikosEvent, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}

export const eventBus = new AikosEventBus();
