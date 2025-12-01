// src/main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // ★ dist/main.js から見て dist/preload.js を指す
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // dist/main.js から見て ../index.html → プロジェクト直下の index.html
  win.loadFile(path.join(__dirname, '../index.html'));
}

app.whenReady().then(() => {
  createWindow();

  //マックOS用のイベント activateが
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
 //マックOS用のイベント
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ファイルオープン処理
ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text', extensions: ['json'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0]!; // length 0 は上で弾いているので ! でOK
  const content = await fs.promises.readFile(filePath, 'utf-8');

  return {
    canceled: false,
    filePath,
    content
  };
});

// 追加：ファイル保存処理
ipcMain.handle(
  'save-file',
  async (_event, args: { filePath: string; content: string }) => {
    const { filePath, content } = args;

    // ここで上書き保存
    await fs.promises.writeFile(filePath, content, 'utf-8');

    return { ok: true };
  }
);