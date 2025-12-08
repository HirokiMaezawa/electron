import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ファイル開く処理
ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0]!;
  const content = await fs.promises.readFile(filePath, 'utf-8');

  return {
    canceled: false,
    filePath,
    content,
  };
});

// ファイル保存処理
ipcMain.handle(
  'save-file',
  async (_event, args: { filePath: string; content: string }) => {
    const { filePath, content } = args;
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { ok: true };
  },
);

// 同じディレクトリの json 一覧
ipcMain.handle('list-json-same-dir', async (_event, filePath: string) => {
  try {
    const dir = path.dirname(filePath);
    const entries = await fs.promises.readdir(dir);
    return entries.filter((name) =>
      name.toLowerCase().endsWith('.json'),
    );
  } catch (err) {
    console.error('list-json-same-dir error:', err);
    return [];
  }
});
