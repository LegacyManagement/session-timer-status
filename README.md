Session Timer Status

VS Code extension that reads ~/.session-timer once per minute and shows `$(clockface) NNhNNm` in the status bar, indicating the hours and minutes left in the current session before termination.

Color rules:
- < 60 minutes: warning background
- < 30 minutes: error background
- < 14 minutes: temporary critical workbench background override plus pulsing status background (normal/error) while keeping clock text visible; restored automatically when time is extended

Critical blink timing is configurable in [src/extension.ts](src/extension.ts) via constants:
- `CRITICAL_BLINK_ON_MS` (default `250`)
- `CRITICAL_BLINK_OFF_MS` (default `100`)

Fails silently if file is missing or malformed.

Development:
- Open repository in GitHub Codespaces
- Press F5 to run the extension
