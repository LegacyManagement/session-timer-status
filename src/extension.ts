import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fsPromises, watch as fsWatch, FSWatcher } from "fs";

let statusItem: vscode.StatusBarItem | undefined;
let pollHandle: NodeJS.Timeout | undefined;
let watcher: FSWatcher | undefined;
let blinkHandle: NodeJS.Timeout | undefined;
let blinkActive = false;
let blinkVisible = true;
let blinkText = "";
let criticalThemeActive = false;
let previousAlertColors: Record<string, string | null> | undefined;

const CRITICAL_MINUTES_THRESHOLD = 14;
const CRITICAL_BLINK_ON_MS = 250;
const CRITICAL_BLINK_OFF_MS = 100;
const CRITICAL_ALERT_COLORS: Record<string, string> = {
  "editor.background": "#4d0f0f",
  "sideBar.background": "#4d0f0f",
  "activityBar.background": "#4d0f0f",
  "statusBar.background": "#7a1414"
};

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sameColorMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => b[k] === a[k]);
}

function scheduleBlinkStep() {
  if (!blinkActive || !statusItem) return;

  if (blinkVisible) {
    statusItem.text = " ";
    blinkVisible = false;
    blinkHandle = setTimeout(scheduleBlinkStep, CRITICAL_BLINK_OFF_MS);
  } else {
    statusItem.text = blinkText;
    blinkVisible = true;
    blinkHandle = setTimeout(scheduleBlinkStep, CRITICAL_BLINK_ON_MS);
  }
}

function startCriticalBlinking(text: string) {
  blinkText = text;

  if (blinkActive) {
    if (blinkVisible && statusItem) {
      statusItem.text = blinkText;
    }
    return;
  }

  blinkActive = true;
  blinkVisible = true;
  if (statusItem) statusItem.text = blinkText;
  blinkHandle = setTimeout(scheduleBlinkStep, CRITICAL_BLINK_ON_MS);
}

function stopCriticalBlinking(stableText?: string) {
  blinkActive = false;
  blinkVisible = true;

  if (blinkHandle) {
    clearTimeout(blinkHandle);
    blinkHandle = undefined;
  }

  if (statusItem && typeof stableText === "string") {
    statusItem.text = stableText;
  }
}

async function applyCriticalThemeAlert() {
  if (criticalThemeActive) return;

  const workbenchCfg = vscode.workspace.getConfiguration("workbench");
  const current = (workbenchCfg.get<Record<string, string>>("colorCustomizations") ?? {});

  previousAlertColors = {};
  for (const key of Object.keys(CRITICAL_ALERT_COLORS)) {
    previousAlertColors[key] = hasOwn(current, key) ? current[key] : null;
  }

  const next = { ...current, ...CRITICAL_ALERT_COLORS };
  if (!sameColorMap(current, next)) {
    await workbenchCfg.update("colorCustomizations", next, vscode.ConfigurationTarget.Global);
  }

  criticalThemeActive = true;
}

async function clearCriticalThemeAlert() {
  if (!criticalThemeActive || !previousAlertColors) return;

  const workbenchCfg = vscode.workspace.getConfiguration("workbench");
  const current = (workbenchCfg.get<Record<string, string>>("colorCustomizations") ?? {});
  const next = { ...current };

  for (const key of Object.keys(CRITICAL_ALERT_COLORS)) {
    const previous = previousAlertColors[key];
    if (previous === null) {
      delete next[key];
    } else {
      next[key] = previous;
    }
  }

  if (!sameColorMap(current, next)) {
    await workbenchCfg.update("colorCustomizations", next, vscode.ConfigurationTarget.Global);
  }

  criticalThemeActive = false;
  previousAlertColors = undefined;
}

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
      stopCriticalBlinking("$(clockface) ∞");
      await clearCriticalThemeAlert();
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

    if (mins < CRITICAL_MINUTES_THRESHOLD) {
      await applyCriticalThemeAlert();
    } else {
      await clearCriticalThemeAlert();
    }

    const baseText = mins < CRITICAL_MINUTES_THRESHOLD
      ? `$(clockface) ${hh}h${mm}m`
      : mins < 30
        ? `$(warning) ${hh}h${mm}m`
        : `$(clockface) ${hh}h${mm}m`;

    if (mins < CRITICAL_MINUTES_THRESHOLD) {
      startCriticalBlinking(baseText);
    } else {
      stopCriticalBlinking(baseText);
    }

    // Theme-aware backgrounds
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
    stopCriticalBlinking();
    await clearCriticalThemeAlert();
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
  stopCriticalBlinking();
  void clearCriticalThemeAlert();
  disposeWatcher();
  statusItem?.dispose();
}
