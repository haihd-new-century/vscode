/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ─── Unity Session Types (mirrors libs/unity-protocol) ────────────────────

export interface UnitySessionInfo {
  id: string;
  projectName: string;
  projectPath: string;
  unityVersion: string;
  platform: string;
  status: 'connected' | 'disconnected' | 'reloading' | string;
  lastHeartbeat: string;
  /** Tool catalog fingerprint reported by the editor. */
  schemaFingerprint?: string;
  /** Number of currently registered editor handlers. */
  handlerCount?: number;
  /** True if the editor is currently in Play mode. */
  isPlaying?: boolean;
  /** True if a domain reload / script compile is in progress. */
  isCompiling?: boolean;
}
