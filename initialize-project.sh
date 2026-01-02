#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="session-timer-status"

echo "Initializing VS Code extension project: ${PROJECT_NAME}"

mkdir -p \
  .devcontainer \
  .vscode \
  src

########################################
# .devcontainer/devcontainer.json
########################################
cat > .devcontainer/devcontainer.json <<'EOF'
{
  "name": "VSCode Extension Dev (Node 20)",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:1-20-bullseye",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {}
  },
  "postCreateCommand": "npm ci",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "ms-vscode.vscode-typescript-next"
      ],
      "settings": {
        "typescript.tsdk": "node_modules/typescript/lib"
      }
    }
  }
}
EOF

########################################
# .vscode/launch.json
########################################
cat > .vscode/launch.json <<'EOF'
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch"
    }
  ]
}
EOF

########################################
# .vscode/tasks.json
########################################
cat > .vscode/tasks.json <<'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "watch",
      "problemMatcher": "$tsc-watch",
      "isBackground": true,
      "label": "npm: watch"
    }
  ]
}
EOF

########################################
# src/extension.ts
########################################
cat > src/extension.ts <<'EOF'
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";

let statusItem: vscode.StatusBarItem | undefined;
let intervalHandle: NodeJS.Timeout | undefined;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatHHMM(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

async function updateStatus(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);

    const minutesLeft = data?.minutes_left;
    const preserve = data?.preserve;

    if (typeof preserve !== "boolean") return;
    if (!preserve && typeof minutesLeft !== "number") return;
    if (!statusItem) return;

    if (preserve) {
      statusItem.text = `$(hourglass) ∞`;
      statusItem.tooltip = "Session preserved indefinitely";
      statusItem.backgroundColor = undefined;
      statusItem.color = undefined;
      statusItem.show();
      return;
    }

    const mins = Math.floor(minutesLeft);
    statusItem.text = `$(hourglass) ${formatHHMM(mins)}`;
    statusItem.tooltip = `${mins} minute(s) left`;

    if (mins < 30) {
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusItem.color = undefined;
    } else if (mins < 60) {
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusItem.color = undefined;
    } else {
      statusItem.backgroundColor = undefined;
      statusItem.color = undefined;
    }

    statusItem.show();
  } catch {
    // fail silently
  }
}

export function activate(context: vscode.ExtensionContext) {
  const filePath = path.join(os.homedir(), ".session-timer");

  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusItem.name = "Session Timer";
  statusItem.hide();

  context.subscriptions.push(statusItem);

  void updateStatus(filePath);
  intervalHandle = setInterval(() => void updateStatus(filePath), 60 * 1000);

  context.subscriptions.push({
    dispose: () => {
      if (intervalHandle) clearInterval(intervalHandle);
    }
  });
}

export function deactivate() {
  if (intervalHandle) clearInterval(intervalHandle);
  statusItem?.dispose();
}
EOF

########################################
# package.json
########################################
cat > package.json <<'EOF'
{
  "name": "session-timer-status",
  "displayName": "Session Timer Status",
  "description": "Shows ~/.session-timer minutes_left/preserve in the status bar.",
  "version": "0.0.1",
  "publisher": "yourname",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {},
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.90.0",
    "typescript": "^5.4.0",
    "vsce": "^2.26.0"
  }
}
EOF

########################################
# tsconfig.json
########################################
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
EOF

########################################
# .gitignore
########################################
cat > .gitignore <<'EOF'
node_modules/
out/
*.vsix
.DS_Store
EOF

########################################
# README.md
########################################
cat > README.md <<'EOF'
Session Timer Status

VS Code extension that reads ~/.session-timer once per minute and shows:

- $(hourglass) ∞ when preserve=true
- $(hourglass) HH:MM when preserve=false

Color rules:
- < 60 minutes: warning background
- < 30 minutes: error background

Fails silently if file is missing or malformed.

Development:
- Open repository in GitHub Codespaces
- Press F5 to run the extension
EOF

echo "Done."
echo "Next steps:"
echo "  1) Push this repo to GitHub"
echo "  2) Open it in Codespaces"
echo "  3) Press F5 to run the extension"
