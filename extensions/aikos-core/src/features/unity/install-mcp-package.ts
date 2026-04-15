/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ----------------------------------------------------------------------------
//  Plan-10 · Sprint U5 · Task U5.6 — One-click AIKOS MCP install for Unity.
//
//  Detects Unity projects in the workspace (any folder containing
//  `ProjectSettings/ProjectVersion.txt`), and when it sees one without the
//  `com.aikos.mcp` package installed, offers to copy the bundled tarball into
//  `<project>/Packages/` and inject it into `Packages/manifest.json`.
// ----------------------------------------------------------------------------

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const PACKAGE_ID = 'com.aikos.mcp';
const TARBALL_GLOB = 'com.aikos.mcp-latest.tgz';
const MEMENTO_KEY = 'aikos.unity.installDismissed';

interface DetectedProject {
  root: string;
  projectVersion: string;
  hasPackage: boolean;
}

export async function registerInstallMcpCommand(
  context: vscode.ExtensionContext,
): Promise<vscode.Disposable[]> {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('aikos.unity.installMcp', async () => {
      const project = await pickOrDetectProject();
      if (!project) return;
      await installInto(context, project);
    }),
  );

  // Auto-prompt once per workspace.
  void maybeOfferInstall(context);

  return disposables;
}

async function maybeOfferInstall(context: vscode.ExtensionContext): Promise<void> {
  const dismissed = context.workspaceState.get<boolean>(MEMENTO_KEY, false);
  if (dismissed) return;

  const projects = await detectUnityProjects();
  const target = projects.find((p) => !p.hasPackage);
  if (!target) return;

  const choice = await vscode.window.showInformationMessage(
    `Detected Unity project "${path.basename(target.root)}" (Unity ${target.projectVersion}). Install the AIKOS MCP package to enable AI control?`,
    'Install',
    'Not now',
    "Don't ask again",
  );
  if (choice === 'Install') {
    await installInto(context, target);
  } else if (choice === "Don't ask again") {
    await context.workspaceState.update(MEMENTO_KEY, true);
  }
}

async function detectUnityProjects(): Promise<DetectedProject[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const out: DetectedProject[] = [];
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const pv = path.join(root, 'ProjectSettings', 'ProjectVersion.txt');
    try {
      const text = await fs.readFile(pv, 'utf8');
      const match = text.match(/m_EditorVersion:\s*([^\r\n]+)/);
      const hasPackage = await exists(path.join(root, 'Packages', PACKAGE_ID));
      out.push({
        root,
        projectVersion: match?.[1]?.trim() ?? 'unknown',
        hasPackage,
      });
    } catch {
      /* not a unity project */
    }
  }
  return out;
}

async function pickOrDetectProject(): Promise<DetectedProject | undefined> {
  const projects = await detectUnityProjects();
  if (projects.length === 0) {
    vscode.window.showWarningMessage('No Unity project detected in the current workspace.');
    return undefined;
  }
  if (projects.length === 1) return projects[0];
  const pick = await vscode.window.showQuickPick(
    projects.map((p) => ({
      label: path.basename(p.root),
      description: `Unity ${p.projectVersion}${p.hasPackage ? ' · installed' : ''}`,
      detail: p.root,
      project: p,
    })),
    { placeHolder: 'Select a Unity project' },
  );
  return pick?.project;
}

async function installInto(
  context: vscode.ExtensionContext,
  project: DetectedProject,
): Promise<void> {
  const tarball = await findBundledTarball(context);
  if (!tarball) {
    vscode.window.showErrorMessage(
      'Bundled com.aikos.mcp tarball not found. Run scripts/package-unity-mcp.sh first.',
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${PACKAGE_ID} into ${path.basename(project.root)}…`,
    },
    async () => {
      const packagesDir = path.join(project.root, 'Packages');
      await fs.mkdir(packagesDir, { recursive: true });

      const destName = path.basename(tarball);
      const destPath = path.join(packagesDir, destName);
      await fs.copyFile(tarball, destPath);

      const manifestPath = path.join(packagesDir, 'manifest.json');
      let manifest: { dependencies?: Record<string, string> } = {};
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      } catch {
        manifest = { dependencies: {} };
      }
      manifest.dependencies = manifest.dependencies ?? {};
      manifest.dependencies[PACKAGE_ID] = `file:./${destName}`;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    },
  );

  const open = await vscode.window.showInformationMessage(
    `${PACKAGE_ID} installed into ${path.basename(project.root)}. Open the project in Unity to finish the import.`,
    'Reveal manifest.json',
    'Dismiss',
  );
  if (open === 'Reveal manifest.json') {
    const manifestUri = vscode.Uri.file(path.join(project.root, 'Packages', 'manifest.json'));
    await vscode.window.showTextDocument(manifestUri);
  }
}

async function findBundledTarball(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const candidates = [
    path.join(context.extensionPath, 'resources', 'unity', TARBALL_GLOB),
    path.join(context.extensionPath, 'resources', 'unity', 'com.aikos.mcp-0.1.0.tgz'),
  ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
