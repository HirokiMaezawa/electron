// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

export type OpenFileResult = {
  canceled: boolean;
  filePath?: string;
  content?: string;
};

console.log('preload loaded'); // ★ デバッグ用ログ

contextBridge.exposeInMainWorld('fileApi2', {
  openFile: (): Promise<OpenFileResult> => {
    return ipcRenderer.invoke('open-file');
  },
  // ★ 追加：保存
  saveFile: (filePath: string, content: string): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('save-file', { filePath, content });
  }
});