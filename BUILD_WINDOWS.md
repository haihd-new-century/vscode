# Building VS Code for Windows

## Prerequisites

1. **Node.js 22.x** (required – project uses 22.21.1 per `.nvmrc`)
   - Download from https://nodejs.org/ or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
   - Node 24+ causes native module build failures (e.g. tree-sitter)

2. **Python** (for node-gyp)
   - https://www.python.org/downloads/
   - Run `pip install setuptools`

3. **Visual Studio Build Tools 2022** (C++ workload)
   - Quick install via winget (x64):
   ```powershell
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget --override "--add Microsoft.VisualStudio.Component.Windows11SDK.22621 --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --add Microsoft.VisualStudio.Component.VC.ATL.Spectre --add Microsoft.VisualStudio.Component.VC.ATLMFC.Spectre"
   ```

4. **Git** – https://git-scm.com/

5. **Path without spaces** – clone into a path like `D:\PROJECTS\vscode`

## Build Steps

### 1. Use Node 22

```powershell
# If using nvm-windows:
nvm install 22.21.1
nvm use 22.21.1

# Verify:
node -v   # Should show v22.x.x
```

### 2. Install dependencies

```powershell
cd d:\PROJECTS\vscode
npm install
```

### 3. Build options

**Option A: Development build (run from source)**

```powershell
npm run watch
```

When you see "Finished compilation", run:

```powershell
.\scripts\code.bat
```

**Option B: Packaged build (distributable)**

```powershell
npm run gulp vscode-win32-x64
```

Output: `D:\PROJECTS\VSCode-win32-x64\`

**Option C: Minified release build**

```powershell
npm run gulp vscode-win32-x64-min
```

### 4. Run the built app

- **Development**: `.\scripts\code.bat`
- **Packaged**: `D:\PROJECTS\VSCode-win32-x64\Code - OSS.exe`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ternary-stream` not found | Run `npm install` in project root (ensures `build/` deps install) |
| tree-sitter / C++20 error | Use Node 22.x instead of Node 24+ |
| `ENOSPC` on Linux | Increase inotify limits |
| Native module build fails | Use **x64 Native Tools Command Prompt for VS 2022** |
| Spectre-mitigated libs error | Add Spectre components in Visual Studio Installer |

## Reference

- [How to Contribute (Wiki)](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)
