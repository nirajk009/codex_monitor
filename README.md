# Codex Limits widget

A small, resizable Windows window showing the Codex 5-hour and weekly balances for up to two ChatGPT accounts.

## Use

1. Put `Codex Limits.exe` and your browser cookie export named `hi.json` in the same folder.
2. For a second account, add its cookie export as `hi2.json` in that folder. The second card appears only while that file exists.
3. Double-click the EXE. Drag the top bar to move it, resize from an edge, and use the green pin button to toggle always-on-top. Click the size button to cycle through normal, small (about half the area), and super small. Each mode remembers its adjusted size.

The widget checks the two accounts every 5 seconds by default. Click `5s` to switch to a 1-minute interval, or `1m` to switch back; the choice is remembered. The status stays still between readings, and ↻ updates immediately. Super small shows the two percentages; hover over a limit to see its reset time. If a cookie file changes, it is reloaded on the next update. Cookie files must be JSON arrays in the browser export format (`name`, `value`, `domain`, and optional cookie fields). If a session expires, export fresh cookies to the same file.

The app reads cookies locally and sends its session and usage requests to `chatgpt.com`. It does not bundle cookie files into the EXE. Treat the JSON files like passwords and do not share them.

## Build locally

With Node.js installed:

```powershell
npm ci
npm test
npm run build
```

The portable executable is written to `dist\Codex Limits.exe`. All packages install in this workspace's `node_modules`; nothing is installed globally.
