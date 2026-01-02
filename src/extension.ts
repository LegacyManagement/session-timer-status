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
