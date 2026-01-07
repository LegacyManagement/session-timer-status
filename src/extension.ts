import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fsPromises, watch as fsWatch, FSWatcher } from "fs";

let statusItem: vscode.StatusBarItem | undefined;
let pollHandle: NodeJS.Timeout | undefined;
let watcher: FSWatcher | undefined;

function resolveFilePath(): string {
  const cfg = vscode.workspace.getConfiguration("sessionTimerStatus");
  const configured = (cfg.get<string>("filePath") ?? "").trim();
  if (configured) return configured;

  return path.join(os.homedir(), ".session-timer");
}

async function updateStatus(filePath: string) {
  try {
    const raw = await fsPromises.readFile(filePath, "utf8");
    const data = JSON.parse(raw);

    const minutesLeft = data?.minutes_left;
    const preserve = data?.preserve;

    // Fail silently if fields are missing or wrong types
    if (typeof preserve !== "boolean") return;
    if (!preserve && typeof minutesLeft !== "number") return;
    if (!statusItem) return;

    if (preserve) {
      statusItem.text = `$(clockface) ∞`;
      statusItem.tooltip = "Session preserved indefinitely";
      statusItem.backgroundColor = undefined;
      statusItem.color = undefined;
      statusItem.show();
      return;
    }

    const mins = Math.floor(minutesLeft);
    const m = Math.max(0, Math.floor(mins));
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    statusItem.tooltip = `${hh}h${mm}m remaining`;

    // Theme-aware backgrounds
    if (mins < 30) {
      statusItem.text = `$(warning) ${hh}h${mm}m`;
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusItem.color = undefined;
    } else if (mins < 60) {
      statusItem.text = `$(clockface) ${hh}h${mm}m`;
      statusItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusItem.color = undefined;
    } else {
      statusItem.text = `$(clockface) ${hh}h${mm}m`;
      statusItem.backgroundColor = undefined;
      statusItem.color = undefined;
    }

    statusItem.show();
  } catch {
    // Fail silently per your requirement
  }
}

function disposeWatcher() {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      // ignore
    }
    watcher = undefined;
  }
}

function startWatcherAndPolling(context: vscode.ExtensionContext) {
  const filePath = resolveFilePath();

  // Initial update
  void updateStatus(filePath);

  // Restart watcher when settings change
  const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("sessionTimerStatus.filePath")) {
      disposeWatcher();
      void updateStatus(resolveFilePath());
      startFsWatch(resolveFilePath());
    }
  });
  context.subscriptions.push(cfgSub);

  // Poll fallback (once a minute)
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(() => void updateStatus(resolveFilePath()), 60 * 1000);
  context.subscriptions.push({
    dispose: () => {
      if (pollHandle) clearInterval(pollHandle);
    }
  });

  // fs.watch for near-instant updates
  startFsWatch(filePath);
}

function startFsWatch(filePath: string) {
  disposeWatcher();

  try {
    // Watch the file’s parent directory so we still see atomic rename/mv updates
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);

    watcher = fsWatch(dir, { persistent: true }, (eventType, filename) => {
      // filename can be null on some platforms
      if (!filename) return;
      if (filename.toString() !== base) return;

      // Debounce-ish: just schedule an update soon
      void updateStatus(filePath);
    });
  } catch {
    // If watch fails, polling still works; fail silently
  }
}

export function activate(context: vscode.ExtensionContext) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = "Session Timer";
  statusItem.hide();
  context.subscriptions.push(statusItem);

  startWatcherAndPolling(context);

  context.subscriptions.push({
    dispose: () => disposeWatcher()
  });
}

export function deactivate() {
  if (pollHandle) clearInterval(pollHandle);
  disposeWatcher();
  statusItem?.dispose();
}
