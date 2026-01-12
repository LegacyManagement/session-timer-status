Session Timer Status

VS Code extension that reads ~/.session-timer once per minute and shows `$(clockface) NNhNNm` in the status bar, indicating the hours and minutes left in the current session before termination.

Color rules:
- < 60 minutes: warning background
- < 30 minutes: error background

Fails silently if file is missing or malformed.

Development:
- Open repository in GitHub Codespaces
- Press F5 to run the extension
