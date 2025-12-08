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
  // 同じディレクトリ内の json ファイル一覧を取得
  listJsonFilesInSameDir: (filePath: string): Promise<string[]> => {
    return ipcRenderer.invoke('list-json-same-dir', filePath);
  },
});
