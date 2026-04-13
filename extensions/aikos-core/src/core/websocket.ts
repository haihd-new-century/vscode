import { io, Socket } from 'socket.io-client';
import { eventBus } from './event-bus';
import { logInfo, logWarn, logError, logDebug } from './logger';
import { WS_EVENTS, DEFAULTS } from '../constants';

export class AikosWebSocket {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;

  connect(apiUrl: string, apiKey: string): void {
    if (this.socket?.connected) {
      logDebug('WebSocket already connected');
      return;
    }

    const wsUrl = apiUrl.replace(/\/api\/v\d+\/?$/, '');

    this.socket = io(`${wsUrl}/ws`, {
      auth: { token: apiKey },
      reconnection: true,
      reconnectionDelay: DEFAULTS.WEBSOCKET_RECONNECT_DELAY,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: DEFAULTS.WEBSOCKET_MAX_RECONNECT,
      timeout: 10_000,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      logInfo('WebSocket connected');
      eventBus.fire('connection:changed', { websocket: true });
    });

    this.socket.on('disconnect', (reason) => {
      logWarn(`WebSocket disconnected: ${reason}`);
      eventBus.fire('connection:changed', { websocket: false });
    });

    this.socket.on('connect_error', (err) => {
      this.reconnectAttempts++;
      logError(`WebSocket connect error (attempt ${this.reconnectAttempts})`, err);
    });

    // Forward server events to internal event bus
    this.socket.on(WS_EVENTS.APPROVAL_CREATED, (data: unknown) => {
      logInfo('Approval request received via WebSocket');
      eventBus.fire('approval:new', data);
    });

    this.socket.on(WS_EVENTS.APPROVAL_RESOLVED, (data: unknown) => {
      eventBus.fire('approval:resolved', data);
    });

    this.socket.on(WS_EVENTS.JOB_PROGRESS, (data: unknown) => {
      eventBus.fire('task:updated', data);
    });

    this.socket.on(WS_EVENTS.NOTIFICATION, (data: unknown) => {
      logDebug('Notification received', data);
    });

    this.socket.on(WS_EVENTS.CHAT_STREAM, (data: unknown) => {
      eventBus.fire('chat:chunk', data);
    });

    this.socket.on(WS_EVENTS.CHAT_DONE, (data: unknown) => {
      eventBus.fire('chat:done', data);
    });
  }

  subscribe(channel: 'job' | 'collection' | 'conversation', id: string): void {
    if (!this.socket?.connected) {
      logWarn(`Cannot subscribe to ${channel}:${id} — not connected`);
      return;
    }

    const event = `subscribe:${channel}`;
    const payload = { [`${channel}Id`]: id };
    this.socket.emit(event, payload);
    logDebug(`Subscribed to ${channel}:${id}`);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      logInfo('WebSocket disconnected');
    }
  }
}
