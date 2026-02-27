const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const pty = require("node-pty");

let mainWindow;
let shellPty;

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

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

ipcMain.handle("pty:start", async () => {
  if (shellPty) return;

  const shell = process.env.SHELL || "bash";

  shellPty = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 120,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
  });

  shellPty.onData((data) => {
    mainWindow.webContents.send("pty:data", data);
  });
});

ipcMain.handle("pty:write", async (_event, input) => {
  if (!shellPty) return;
  shellPty.write(input);
});