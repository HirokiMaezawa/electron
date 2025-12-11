// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

export type OpenFileResult = {
  canceled: boolean;
  filePath?: string;
  content?: string;
};

contextBridge.exposeInMainWorld('fileApi2', {
  openFile: (): Promise<OpenFileResult> => {
    return ipcRenderer.invoke('open-file');
  },

  saveFile: (filePath: string, content: string): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('save-file', { filePath, content });
  },

  // 同じディレクトリ内の JSON 一覧
  listJsonFilesInSameDir: (filePath: string): Promise<string[]> => {
    return ipcRenderer.invoke('list-json-files-in-same-dir', filePath);
  },

  // JSON ファイルパス＋assetKey（pictures/xxx）から画像の file:// URL を解決
  resolveImagePath: (
    filePath: string,
    assetKey: string
  ): Promise<string | null> => {
    return ipcRenderer.invoke('resolve-image-path', { filePath, assetKey });
  },

  // ★ 追加：同じディレクトリに空 JSON を作成
  // baseFilePath: いま開いている JSON のフルパス
  // newName: 拡張子なしのベース名（省略可）
  createEmptyJsonInSameDir: (
    baseFilePath: string,
    newName?: string
  ): Promise<{ ok: boolean; fileName: string }> => {
    return ipcRenderer.invoke('create-empty-json', { baseFilePath, newName });
  },
});
