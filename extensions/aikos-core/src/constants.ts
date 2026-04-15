/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ─── Configuration Keys ────────────────────────────────────────────────────

export const CONFIG_SECTION = 'aikos';

export const CONFIG_KEYS = {
  API_URL: 'aikos.apiUrl',
  AGENT_SERVICE_URL: 'aikos.agentServiceUrl',
  DEFAULT_COLLECTION: 'aikos.defaultCollection',
  DEFAULT_MODEL: 'aikos.defaultModel',
  ENABLE_COMPLETION: 'aikos.enableCompletion',
  ENABLE_CODELENS: 'aikos.enableCodeLens',
  ENABLE_DIAGNOSTICS: 'aikos.enableDiagnostics',
  COMPLETION_DEBOUNCE: 'aikos.completionDebounce',
  MAX_CONTEXT_TOKENS: 'aikos.maxContextTokens',
  AUTO_APPROVE_SAFE: 'aikos.autoApprove.safe',
  AUTO_APPROVE_LOW: 'aikos.autoApprove.low',
  NOTIFICATIONS_APPROVAL: 'aikos.notifications.approval',
  LANGUAGE: 'aikos.language',
} as const;

// ─── Secrets ───────────────────────────────────────────────────────────────

export const SECRET_KEYS = {
  API_KEY: 'aikos.apiKey',
} as const;

// ─── Default Values ────────────────────────────────────────────────────────

export const DEFAULTS = {
  API_URL: 'http://localhost:3001/api/v1',
  AGENT_SERVICE_URL: 'http://localhost:8100',
  COMPLETION_DEBOUNCE: 500,
  MAX_CONTEXT_TOKENS: 4000,
  HEALTH_CHECK_INTERVAL: 30_000,   // 30 seconds
  APPROVAL_POLL_INTERVAL: 30_000,  // 30 seconds
  WEBSOCKET_RECONNECT_DELAY: 1000, // 1 second
  WEBSOCKET_MAX_RECONNECT: 10,
  SSE_TIMEOUT: 60_000,             // 60 seconds
  API_TIMEOUT: 10_000,             // 10 seconds
  API_MAX_RETRIES: 3,
} as const;

// ─── View IDs ──────────────────────────────────────────────────────────────

export const VIEW_IDS = {
  CHAT: 'aikos.chat',
  TASKS: 'aikos.tasks',
  APPROVALS: 'aikos.approvals',
  COLLECTIONS: 'aikos.collections',
  SEARCH: 'aikos.search',
  MEMORY: 'aikos.memory',
  UNITY_SESSIONS: 'aikos.unitySessions',
} as const;

// ─── Command IDs ───────────────────────────────────────────────────────────

export const COMMANDS = {
  CHAT_ASK: 'aikos.chat.ask',
  CHAT_EXPLAIN: 'aikos.chat.explain',
  CHAT_REVIEW: 'aikos.chat.review',
  CHAT_FIX: 'aikos.chat.fix',
  CHAT_TEST: 'aikos.chat.test',
  CHAT_REFACTOR: 'aikos.chat.refactor',
  SEARCH_KNOWLEDGE: 'aikos.search.knowledge',
  TASK_SUBMIT: 'aikos.task.submit',
  TASK_LIST: 'aikos.task.list',
  TASK_STOP: 'aikos.task.stop',
  TASK_RESUME: 'aikos.task.resume',
  TASK_DETAIL: 'aikos.task.detail',
  TASK_ROLLBACK: 'aikos.task.rollback',
  APPROVAL_LIST: 'aikos.approval.list',
  APPROVAL_APPROVE: 'aikos.approval.approve',
  APPROVAL_REJECT: 'aikos.approval.reject',
  APPROVAL_DETAIL: 'aikos.approval.detail',
  COLLECTIONS_ADD_FILE: 'aikos.collections.addFile',
  NL2SQL: 'aikos.nl2sql',
  METRICS: 'aikos.metrics',
  AUDIT: 'aikos.audit',
  WORKFLOWS: 'aikos.workflows',
  SETTINGS: 'aikos.settings',
  COMPLETION_TRIGGER: 'aikos.completion.trigger',
  UNITY_REFRESH: 'aikos.unity.refresh',
  UNITY_PIN: 'aikos.unity.pin',
  UNITY_UNPIN: 'aikos.unity.unpin',
  UNITY_FOCUS: 'aikos.unity.focus',
  UNITY_INVOKE_PING: 'aikos.unity.invokePing',
  UNITY_OPEN_DASHBOARD: 'aikos.unity.openDashboard',
  UNITY_INSTALL_MCP: 'aikos.unity.installMcp',
} as const;

// ─── WebSocket Events ──────────────────────────────────────────────────────

export const WS_EVENTS = {
  // Server → Client
  JOB_PROGRESS: 'job:progress',
  NOTIFICATION: 'notification',
  CHAT_STREAM: 'chat:stream',
  CHAT_DONE: 'chat:done',
  APPROVAL_CREATED: 'approval.created',
  APPROVAL_RESOLVED: 'approval.resolved',

  // Client → Server
  SUBSCRIBE_JOB: 'subscribe:job',
  SUBSCRIBE_COLLECTION: 'subscribe:collection',
  SUBSCRIBE_CONVERSATION: 'subscribe:conversation',
} as const;

// ─── SSE Event Types ───────────────────────────────────────────────────────

export const SSE_TYPES = {
  DELTA: 'delta',
  SOURCES: 'sources',
  DONE: 'done',
  ERROR: 'error',
  STEP_START: 'step_start',
  STEP_COMPLETE: 'step_complete',
} as const;

// ─── Output Channel ────────────────────────────────────────────────────────

export const OUTPUT_CHANNEL_NAME = 'AIKOS AI';

// ─── Misc ──────────────────────────────────────────────────────────────────

export const EXTENSION_ID = 'aikos.aikos-ai';
