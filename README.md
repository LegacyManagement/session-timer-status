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
