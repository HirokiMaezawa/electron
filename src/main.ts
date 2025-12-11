// main.ts
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

// ===================== ファイル開く =====================
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

// ===================== ファイル保存 =====================
ipcMain.handle(
  'save-file',
  async (_event, args: { filePath: string; content: string }) => {
    const { filePath, content } = args;
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { ok: true };
  }
);

// ===================== 同じ階層の JSON 一覧 =====================
ipcMain.handle(
  'list-json-files-in-same-dir',
  async (_event, baseFilePath: string) => {
    try {
      const dir = path.dirname(baseFilePath);
      const files = await fs.promises.readdir(dir);
      return files.filter(f => f.toLowerCase().endsWith('.json'));
    } catch (err) {
      console.error('list-json-files-in-same-dir error:', err);
      return [];
    }
  }
);

// ===================== 画像パス解決 =====================
ipcMain.handle(
  'resolve-image-path',
  async (
    _event,
    args: { filePath: string; assetKey: string }
  ): Promise<string | null> => {
    try {
      const { filePath, assetKey } = args;
      if (!filePath || !assetKey) return null;

      const jsonDir = path.dirname(filePath); // .../StreamingAssets/jsonAsset

      // assetKey 例: "pictures/bg_room"
      let relative = assetKey.replace(/^[/\\]+/, ''); // 先頭の / を削除
      let candidate: string;

      if (relative.startsWith('pictures/')) {
        // ../pictures/bg_room.png を想定
        candidate = path.join(jsonDir, '..', `${relative}.png`);
      } else {
        // 同じディレクトリ or その下に置かれているケース
        candidate = path.join(jsonDir, `${relative}.png`);
      }

      if (!fs.existsSync(candidate)) {
        // 拡張子 .jpg の可能性も試す
        const jpgCandidate = candidate.replace(/\.png$/i, '.jpg');
        if (fs.existsSync(jpgCandidate)) {
          candidate = jpgCandidate;
        } else {
          return null;
        }
      }

      const fileUrl =
        'file://' +
        candidate
          .replace(/\\/g, '/')
          .replace(/ /g, '%20');

      return fileUrl;
    } catch (err) {
      console.error('resolve-image-path error:', err);
      return null;
    }
  }
);

// ===================== ★ 空 JSON を同じディレクトリに作成 =====================
ipcMain.handle(
  'create-empty-json',
  async (
    _event,
    args: { baseFilePath: string; newName?: string }
  ): Promise<{ ok: boolean; fileName: string }> => {
    try {
      const { baseFilePath, newName } = args;
      if (!baseFilePath) {
        throw new TypeError('baseFilePath is required');
      }

      const dir = path.dirname(baseFilePath);

      // ベース名（省略時は new_scenario）
      const base = (newName && newName.trim()) || 'new_scenario';

      // 被らないファイル名を探す
      let candidate = path.join(dir, `${base}.json`);
      let index = 1;
      while (fs.existsSync(candidate)) {
        candidate = path.join(dir, `${base}_${index}.json`);
        index++;
      }

      // 空の配列 JSON を書き込む
      await fs.promises.writeFile(candidate, '[]', 'utf-8');

      return { ok: true, fileName: path.basename(candidate) };
    } catch (err) {
      console.error('create-empty-json error:', err);
      throw err;
    }
  }
);
