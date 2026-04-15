/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ----------------------------------------------------------------------------
//  @unity chat mention parser
//  Plan-10 · Sprint U3 · Task U3.5
//
//  Detects `@unity` or `@unity:slug` in a user chat query, resolves it to a
//  Unity session via the cached sidebar provider, and returns a rewritten
//  query string with a system note plus the resolved sessionId so the chat
//  pipeline can pin tool calls to that editor.
// ----------------------------------------------------------------------------

import { UnitySessionInfo } from './unity-types';
import { UnitySessionsProvider } from './unity-sessions-provider';
import { UnitySessionState } from './unity-state';

const MENTION_RE = /@unity(?::([\w\-]+))?\b/gi;

export interface UnityMentionResult {
  /** Query with `@unity:foo` mentions stripped (or replaced by readable name). */
  query: string;
  /** Resolved session, if any. */
  sessionId?: string;
  session?: UnitySessionInfo;
  /** True if the original query mentioned `@unity` at all. */
  mentioned: boolean;
  /** Human-readable note to prepend to the conversation. */
  note?: string;
}

export function parseUnityMention(
  rawQuery: string,
  provider: UnitySessionsProvider,
  state: UnitySessionState,
): UnityMentionResult {
  const matches = Array.from(rawQuery.matchAll(MENTION_RE));
  if (matches.length === 0) {
    // No mention — fall back to pinned session if any.
    const pinned = state.pinnedSessionId;
    if (pinned) {
      const session = provider.listCached().find((s) => s.id === pinned);
      if (session) return { query: rawQuery, sessionId: session.id, session, mentioned: false };
    }
    return { query: rawQuery, mentioned: false };
  }

  // Use the first @unity:slug if present, else the first bare @unity.
  const sessions = provider.listCached();
  let resolved: UnitySessionInfo | undefined;

  for (const m of matches) {
    const slug = m[1]?.toLowerCase();
    if (slug) {
      resolved =
        sessions.find((s) => s.id.toLowerCase().startsWith(slug)) ||
        sessions.find((s) => (s.projectName || '').toLowerCase().includes(slug));
      if (resolved) break;
    }
  }
  if (!resolved) {
    // bare @unity → pinned, then single-session, then nothing
    const pinned = state.pinnedSessionId;
    resolved = sessions.find((s) => s.id === pinned);
    if (!resolved && sessions.length === 1) resolved = sessions[0];
  }

  // Strip mentions from query so the LLM doesn't echo them.
  const query = rawQuery.replace(MENTION_RE, '').replace(/\s{2,}/g, ' ').trim();

  if (!resolved) {
    return {
      query,
      mentioned: true,
      note: 'No Unity Editor session matched the @unity mention.',
    };
  }

  return {
    query,
    sessionId: resolved.id,
    session: resolved,
    mentioned: true,
    note: `Pinned to Unity session **${resolved.projectName || resolved.id}** (${resolved.unityVersion}).`,
  };
}
