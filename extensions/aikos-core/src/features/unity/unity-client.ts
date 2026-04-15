/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ----------------------------------------------------------------------------
//  Unity REST client used by the VS Code extension sidebar.
//  Wraps the AIKOS API endpoints exposed by apps/api/src/modules/unity.
// ----------------------------------------------------------------------------

import { AikosApiClient } from '../../core/api-client';
import { UnitySessionInfo } from './unity-types';

export class UnityExtensionClient {
  constructor(private readonly api: AikosApiClient) {}

  async listSessions(): Promise<UnitySessionInfo[]> {
    try {
      const res = await this.api.get<UnitySessionInfo[] | { sessions: UnitySessionInfo[] }>(
        '/unity/sessions',
      );
      // Backend returns either an array or { sessions: [...] }
      if (Array.isArray(res)) return res;
      if (res && Array.isArray((res as { sessions?: UnitySessionInfo[] }).sessions)) {
        return (res as { sessions: UnitySessionInfo[] }).sessions;
      }
      return [];
    } catch {
      return [];
    }
  }

  async invoke<T = unknown>(
    sessionId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return this.api.post<T>(`/unity/sessions/${sessionId}/invoke`, {
      method,
      params,
    });
  }
}
