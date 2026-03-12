const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const pty = require("node-pty");
const ollama = require('./ollama.cjs');

let mainWindow;
let shellPty;

// --- Session Context State ---
let sessionContext = {
  currentCommand: '',
  currentOutput: '',
  cwd: process.env.HOME || '/',
  history: []
};

let isCapturingOutput = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(createWindow);

ipcMain.on("pty:start", (_event, { cols, rows } = {}) => {
  if (shellPty) return;

  const shell = process.env.SHELL || "bash";

  shellPty = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: cols || 120,
    rows: rows || 30,
    cwd: process.env.HOME,
    env: process.env,
  });

  shellPty.onData((data) => {
    mainWindow.webContents.send("pty:data", data);

    const clean = data
      .replace(/\x1B\[[0-9;]*[mGKHFJl]/g, '')
      .replace(/\x1B\[\?[0-9;]*[hl]/g, '')
      .replace(/\r/g, '');

    const promptPattern = /\$\s*$|#\s*$/m;
    if (promptPattern.test(clean)) {
      if (isCapturingOutput && sessionContext.currentCommand) {
        const snapshot = {
          currentCommand: sessionContext.currentCommand,
          currentOutput: sessionContext.currentOutput.trim(),
          cwd: sessionContext.cwd,
          history: [...sessionContext.history]
        };

        if (sessionContext.history[sessionContext.history.length - 1] !== sessionContext.currentCommand) {
          if (sessionContext.history.length >= 10) sessionContext.history.shift();
          sessionContext.history.push(sessionContext.currentCommand);
        }

        clearTimeout(sessionContext._debounce);
        sessionContext._debounce = setTimeout(() => {
          mainWindow.webContents.send('context:ready', snapshot);
        }, 150);
      }
      isCapturingOutput = false;
      sessionContext.currentOutput = '';
    } else {
      if (isCapturingOutput) {
        sessionContext.currentOutput += clean;
      }
    }
  });
});

ipcMain.on('pty:write', (_event, data) => {
  // Detect Enter key = command submission
  if (data === '\r') {
    console.log('CMD BUFFER:', JSON.stringify(sessionContext.currentCommand));
    const cmd = sessionContext.currentCommand.trim();

    if (cmd.startsWith('@') || cmd.startsWith('#')) {
      // Clear the typed line and trigger a fresh prompt
      mainWindow.webContents.send('pty:data', '\r\x1B[2K\r\n');
      shellPty.write('\r');

      // AI prefix — do NOT send to shell, route to AI instead
      mainWindow.webContents.send('ai:query', {
        type: cmd.startsWith('@') ? 'query' : 'script',
        input: cmd.slice(1).trim(),
        context: {
          currentCommand: sessionContext.currentCommand,
          currentOutput: sessionContext.currentOutput,
          cwd: sessionContext.cwd,
          history: [...sessionContext.history]
        }
      });
      sessionContext.currentCommand = '';
      return; // block from reaching PTY
    }

    // Normal command — send to shell and start capturing
    isCapturingOutput = true;
    sessionContext.currentOutput = '';
    sessionContext.currentCommand = '';
  } else if (data === '\x7f') {
    // Backspace
    sessionContext.currentCommand = sessionContext.currentCommand.slice(0, -1);
  } else {
    sessionContext.currentCommand += data;
  }

  if (!shellPty) return;
  shellPty.write(data);
});

ipcMain.handle('context:get', () => ({ ...sessionContext }));

ipcMain.handle('ai:explain', async (_event, context) => {
  return ollama.explainOutput(context);
});

ipcMain.handle('ai:query', async (_event, { input, context }) => {
  return ollama.answerQuery(input, context);
});

ipcMain.handle('ai:script', async (_event, { input, context }) => {
  return ollama.generateScript(input, context);
});
