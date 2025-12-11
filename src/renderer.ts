// src/renderer.ts

// ========= 型定義 =========
type Scene = {
  texts: string[];
  next: number;
  backgroundName: string;
  showBackground: boolean;
  characterName: string;
  characterPicture: string;
  showCharacter: boolean;
  isTransitionToResult: boolean;
  eventPictureNum: number;

  // タイトル背景・結果背景（全シーン共通だが JSON 上は各シーンにも持たせる）
  titleBackgroundName: string;
  resultBackgroundName: string;

  choices: Choice[];
};

type OpenFileResult = {
  canceled: boolean;
  filePath?: string;
  content?: string;
};

type Choice = {
  text: string;
  nextFile: string;
};

type FileApi = {
  openFile: () => Promise<OpenFileResult>;
  saveFile: (filePath: string, content: string) => Promise<{ ok: boolean }>;
  listJsonFilesInSameDir?: (filePath: string) => Promise<string[]>;
  resolveImagePath?: (filePath: string, assetKey: string) => Promise<string | null>;

  // ★ 同じディレクトリに空の JSON を作成する
  //   第2引数は拡張子なしのベース名（省略可）
  createEmptyJsonInSameDir?: (
    baseFilePath: string,
    newName?: string
  ) => Promise<{ ok: boolean; fileName: string }>;
};

// ========= グローバル状態 =========

let currentPath: string | null = null;
let scenes: Scene[] = [];
let currentIndex = 0;

// シーンごとの背景・キャラ画像プレビュー用 URL
let bgPreviewUrls: (string | null)[] = [];
let charPreviewUrls: (string | null)[] = [];

// 同じディレクトリの JSON 一覧（プルダウン用）
let jsonFileOptions: string[] = [];

// 全シーン共通のタイトル背景
let sharedTitleBgName = '';
let titleBgPreviewUrl: string | null = null;

// 全シーン共通の結果背景
let sharedResultBgName = '';
let resultBgPreviewUrl: string | null = null;

// ========= ヘルパー =========

/** pictures/bg_room → pictures/bg_room.png みたいに URL を推測 */
function resolveAssetUrlFromKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^(blob:|https?:|file:)/.test(key)) return key;
  return `${key}.png`;
}

// ========= 名前入力ダイアログ（モーダル） =========
function showNameInputDialog(
  title: string,
  message: string,
  defaultValue = ''
): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const modal = document.createElement('div');
    modal.style.background = '#111827';
    modal.style.padding = '16px 20px';
    modal.style.borderRadius = '10px';
    modal.style.minWidth = '280px';
    modal.style.maxWidth = '90%';
    modal.style.color = '#e5e7eb';
    modal.style.boxShadow = '0 20px 40px rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.gap = '8px';

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontWeight = '600';
    titleEl.style.marginBottom = '4px';

    const msgEl = document.createElement('div');
    msgEl.textContent = message;
    msgEl.style.fontSize = '12px';
    msgEl.style.color = '#9ca3af';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.style.marginTop = '8px';
    input.style.padding = '6px 8px';
    input.style.borderRadius = '6px';
    input.style.border = '1px solid #4b5563';
    input.style.background = '#020617';
    input.style.color = '#e5e7eb';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '8px';
    btnRow.style.marginTop = '12px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.padding = '4px 10px';
    cancelBtn.style.borderRadius = '999px';
    cancelBtn.style.border = 'none';
    cancelBtn.style.background = '#374151';
    cancelBtn.style.color = '#e5e7eb';
    cancelBtn.style.cursor = 'pointer';

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.padding = '4px 12px';
    okBtn.style.borderRadius = '999px';
    okBtn.style.border = 'none';
    okBtn.style.background = '#2563eb';
    okBtn.style.color = '#fff';
    okBtn.style.cursor = 'pointer';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);

    modal.appendChild(titleEl);
    modal.appendChild(msgEl);
    modal.appendChild(input);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = (value: string | null) => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    okBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) {
        // 空ならそのまま閉じて何もしない
        close(null);
      } else {
        close(val);
      }
    });

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(null);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        okBtn.click();
      } else if (e.key === 'Escape') {
        close(null);
      }
    });

    // 自動フォーカス
    setTimeout(() => input.focus(), 0);
  });
}



/** タイトル／結果のドロップゾーンの見た目を更新 */
function refreshSharedDropZonePreview() {
  const titleDrop = document.getElementById('title-bg-drop') as HTMLDivElement | null;
  if (titleDrop) {
    if (!titleBgPreviewUrl && sharedTitleBgName) {
      titleBgPreviewUrl = resolveAssetUrlFromKey(sharedTitleBgName);
    }
    if (titleBgPreviewUrl) {
      titleDrop.style.backgroundImage = `url(${titleBgPreviewUrl})`;
      titleDrop.style.backgroundSize = 'cover';
      titleDrop.style.backgroundPosition = 'center';
      titleDrop.style.color = 'transparent';
    } else {
      titleDrop.style.backgroundImage = '';
      titleDrop.style.color = '#475569';
    }
  }

  const resultDrop = document.getElementById('result-bg-drop') as HTMLDivElement | null;
  if (resultDrop) {
    if (!resultBgPreviewUrl && sharedResultBgName) {
      resultBgPreviewUrl = resolveAssetUrlFromKey(sharedResultBgName);
    }
    if (resultBgPreviewUrl) {
      resultDrop.style.backgroundImage = `url(${resultBgPreviewUrl})`;
      resultDrop.style.backgroundSize = 'cover';
      resultDrop.style.backgroundPosition = 'center';
      resultDrop.style.color = 'transparent';
    } else {
      resultDrop.style.backgroundImage = '';
      resultDrop.style.color = '#475569';
    }
  }
}

/**
 * JSON を読み込んだあと、backgroundName / characterPicture / タイトル / 結果 の
 * プレビュー URL を「実ファイルから」初期化する
 */
async function initPreviewUrlsFromJson(api: FileApi, filePath: string | null) {
  bgPreviewUrls = new Array(scenes.length).fill(null);
  charPreviewUrls = new Array(scenes.length).fill(null);
  titleBgPreviewUrl = null;
  resultBgPreviewUrl = null;

  if (!filePath || !api.resolveImagePath) {
    // preload 側未対応 or パス無し → 旧来の推測方式
    bgPreviewUrls = scenes.map(s => resolveAssetUrlFromKey(s.backgroundName));
    charPreviewUrls = scenes.map(s => resolveAssetUrlFromKey(s.characterPicture));
    titleBgPreviewUrl = resolveAssetUrlFromKey(sharedTitleBgName);
    resultBgPreviewUrl = resolveAssetUrlFromKey(sharedResultBgName);
    return;
  }

  // 背景・キャラ
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];

    if (s.backgroundName) {
      try {
        const u = await api.resolveImagePath(filePath, s.backgroundName);
        bgPreviewUrls[i] = u ?? resolveAssetUrlFromKey(s.backgroundName);
      } catch {
        bgPreviewUrls[i] = resolveAssetUrlFromKey(s.backgroundName);
      }
    }

    if (s.characterPicture) {
      try {
        const u = await api.resolveImagePath(filePath, s.characterPicture);
        charPreviewUrls[i] = u ?? resolveAssetUrlFromKey(s.characterPicture);
      } catch {
        charPreviewUrls[i] = resolveAssetUrlFromKey(s.characterPicture);
      }
    }
  }

  // タイトル背景
  if (sharedTitleBgName) {
    try {
      const u = await api.resolveImagePath(filePath, sharedTitleBgName);
      titleBgPreviewUrl = u ?? resolveAssetUrlFromKey(sharedTitleBgName);
    } catch {
      titleBgPreviewUrl = resolveAssetUrlFromKey(sharedTitleBgName);
    }
  }

  // 結果背景
  if (sharedResultBgName) {
    try {
      const u = await api.resolveImagePath(filePath, sharedResultBgName);
      resultBgPreviewUrl = u ?? resolveAssetUrlFromKey(sharedResultBgName);
    } catch {
      resultBgPreviewUrl = resolveAssetUrlFromKey(sharedResultBgName);
    }
  }
}

// ========= フォーム ⇔ シーン同期 =========

/** 現在のフォーム内容を、現在のシーン＋共有設定に反映 */
function saveFormToCurrentScene() {
  if (!scenes.length) return;

  const scene = scenes[currentIndex];
  if (!scene) return;

  const text1 = (document.getElementById('text1') as HTMLInputElement | null)?.value ?? '';
  const text2 = (document.getElementById('text2') as HTMLInputElement | null)?.value ?? '';
  const next = Number((document.getElementById('next') as HTMLInputElement | null)?.value ?? 0);
  const bgName =
    (document.getElementById('backgroundName') as HTMLInputElement | null)?.value ?? '';
  const charName =
    (document.getElementById('characterName') as HTMLInputElement | null)?.value ?? '';
  const charPic =
    (document.getElementById('characterPicture') as HTMLInputElement | null)?.value ?? '';
  const showBg =
    (document.getElementById('showBackground') as HTMLInputElement | null)?.checked ?? true;
  const showChar =
    (document.getElementById('showCharacter') as HTMLInputElement | null)?.checked ?? true;
  const isResult =
    (document.getElementById('isTransitionToResult') as HTMLInputElement | null)?.checked ?? false;

  const titleInputEl = document.getElementById('titleBackgroundName') as HTMLInputElement | null;
  const resultInputEl = document.getElementById('resultBackgroundName') as HTMLInputElement | null;

  sharedTitleBgName = titleInputEl?.value ?? sharedTitleBgName;
  sharedResultBgName = resultInputEl?.value ?? sharedResultBgName;

  // 現在シーン
  scene.texts = [text1, text2].filter(t => t !== '');
  scene.next = next;
  scene.backgroundName = bgName;
  scene.characterName = charName;
  scene.characterPicture = charPic;
  scene.showBackground = showBg;
  scene.showCharacter = showChar;
  scene.isTransitionToResult = isResult;

  // 全シーンに共有背景を反映
  scenes.forEach(s => {
    s.titleBackgroundName = sharedTitleBgName;
    s.resultBackgroundName = sharedResultBgName;
  });

  if (!bgPreviewUrls[currentIndex]) {
    bgPreviewUrls[currentIndex] = resolveAssetUrlFromKey(bgName);
  }
  if (!charPreviewUrls[currentIndex]) {
    charPreviewUrls[currentIndex] = resolveAssetUrlFromKey(charPic);
  }

  refreshSharedDropZonePreview();
  renderSceneList();
}

// ========= 選択肢エリア =========

/** 選択肢一覧を描画（nextFile はプルダウン） */
function renderChoices() {
  const container = document.getElementById('choices-container') as HTMLDivElement | null;
  if (!container) return;

  container.innerHTML = '';

  if (!scenes.length || currentIndex < 0 || currentIndex >= scenes.length) {
    container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    return;
  }

  const scene = scenes[currentIndex];
  const choices = scene?.choices ?? [];

  if (!choices.length) {
    container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    return;
  }

  choices.forEach((choice, idx) => {
    const div = document.createElement('div');
    div.className = 'choice-item';

    const optionsHtml =
      '<option value="">（未選択）</option>' +
      jsonFileOptions
        .map(name => {
          const base = name.replace(/\.json$/i, '');
          const value = `jsonAsset/${base}`;
          const selected = choice.nextFile === value ? ' selected' : '';
          return `<option value="${value}"${selected}>${name}</option>`;
        })
        .join('');

    div.innerHTML = `
      <div class="choice-header">
        <span>選択肢 ${idx + 1}</span>
        <button class="btn btn-danger" data-delete-choice="${idx}">削除</button>
      </div>
      <label>テキスト:
        <input
          data-choice-index="${idx}"
          data-field="text"
          type="text"
          value="${choice.text ?? ''}"
        />
      </label><br/>
      <label>次ファイル:
        <select
          data-choice-index="${idx}"
          data-field="nextFile"
        >
          ${optionsHtml}
        </select>
      </label>
    `;

    container.appendChild(div);
  });
}

// ========= シーン一覧（左カラム） =========

/** シーン一覧を描画（左カラム） */
function renderSceneList() {
  const listEl = document.getElementById('scene-list') as HTMLDivElement | null;
  if (!listEl) return;

  listEl.innerHTML = '';

  if (!scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'choices-empty';
    empty.textContent = 'シーンがありません。';
    listEl.appendChild(empty);
    return;
  }

  scenes.forEach((scene, idx) => {
    const item = document.createElement('div');
    item.className = 'scene-list-item' + (idx === currentIndex ? ' active' : '');
    item.dataset.index = String(idx);

    // サムネイル
    const thumb = document.createElement('div');
    thumb.className = 'scene-list-thumb';

    const bgUrl = bgPreviewUrls[idx];
    if (scene.showBackground && bgUrl) {
      thumb.style.backgroundImage = `url(${bgUrl})`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
      thumb.textContent = '';
    } else {
      thumb.style.backgroundImage = '';
      thumb.textContent = `#${idx + 1}`;
    }

    // キャラ用レイヤー
    const charLayer = document.createElement('div');
    charLayer.className = 'scene-list-thumb-char';
    const charUrl = charPreviewUrls[idx];
    if (charUrl) {
      charLayer.style.backgroundImage = `url(${charUrl})`;
    }
    thumb.appendChild(charLayer);

    // 右側テキスト部分
    const main = document.createElement('div');
    main.className = 'scene-list-main';

    const header = document.createElement('div');
    header.className = 'scene-list-item-header';

    const indexSpan = document.createElement('span');
    indexSpan.className = 'scene-list-index';
    indexSpan.textContent = `#${idx + 1}`;

    const flagsSpan = document.createElement('span');
    flagsSpan.className = 'scene-list-flags';
    const flags: string[] = [];
    if (scene.isTransitionToResult) flags.push('結果へ');
    if (scene.choices?.length) flags.push(`選択肢${scene.choices.length}`);
    flagsSpan.textContent = flags.join('・');

    header.appendChild(indexSpan);
    header.appendChild(flagsSpan);

    const textSpan = document.createElement('div');
    textSpan.className = 'scene-list-text';
    const firstLine = scene.texts?.[0] ?? '';
    textSpan.textContent = firstLine || '(テキストなし)';

    main.appendChild(header);
    main.appendChild(textSpan);

    item.appendChild(thumb);
    item.appendChild(main);

    listEl.appendChild(item);
  });
}

// ========= シーン → フォーム =========

/** 現在のシーンをフォームに表示 */
function loadCurrentSceneToForm() {
  const indexLabel = document.getElementById('scene-index') as HTMLSpanElement | null;
  const totalLabel = document.getElementById('scene-total') as HTMLSpanElement | null;

  if (!scenes.length) {
    if (indexLabel) indexLabel.textContent = '0';
    if (totalLabel) totalLabel.textContent = '0';
    const container = document.getElementById('choices-container') as HTMLDivElement | null;
    if (container) {
      container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    }
    renderSceneList();
    return;
  }

  const scene = scenes[currentIndex];

  if (indexLabel) indexLabel.textContent = String(currentIndex + 1);
  if (totalLabel) totalLabel.textContent = String(scenes.length);

  const t1 = scene?.texts[0] ?? '';
  const t2 = scene?.texts[1] ?? '';

  const text1El = document.getElementById('text1') as HTMLInputElement | null;
  const text2El = document.getElementById('text2') as HTMLInputElement | null;
  const nextEl = document.getElementById('next') as HTMLInputElement | null;
  const bgNameEl = document.getElementById('backgroundName') as HTMLInputElement | null;
  const charNameEl = document.getElementById('characterName') as HTMLInputElement | null;
  const charPicEl = document.getElementById('characterPicture') as HTMLInputElement | null;
  const showBgEl = document.getElementById('showBackground') as HTMLInputElement | null;
  const showCharEl = document.getElementById('showCharacter') as HTMLInputElement | null;
  const isResultEl = document.getElementById('isTransitionToResult') as HTMLInputElement | null;

  if (text1El) text1El.value = t1;
  if (text2El) text2El.value = t2;
  if (nextEl) nextEl.value = String(scene?.next ?? 0);
  if (bgNameEl) bgNameEl.value = scene?.backgroundName ?? '';
  if (charNameEl) charNameEl.value = scene?.characterName ?? '';
  if (charPicEl) charPicEl.value = scene?.characterPicture ?? '';
  if (showBgEl) showBgEl.checked = scene?.showBackground ?? true;
  if (showCharEl) showCharEl.checked = scene?.showCharacter ?? true;
  if (isResultEl) isResultEl.checked = scene?.isTransitionToResult ?? false;

  // 共有背景の入力欄も更新
  const titleInputEl = document.getElementById('titleBackgroundName') as HTMLInputElement | null;
  const resultInputEl = document.getElementById('resultBackgroundName') as HTMLInputElement | null;
  if (titleInputEl) titleInputEl.value = sharedTitleBgName;
  if (resultInputEl) resultInputEl.value = sharedResultBgName;

  const bgDrop = document.getElementById('background-drop') as HTMLDivElement | null;
  if (bgDrop) {
    const url = bgPreviewUrls[currentIndex] ?? null;
    if (url) {
      bgDrop.style.backgroundImage = `url(${url})`;
      bgDrop.style.backgroundSize = 'cover';
      bgDrop.style.backgroundPosition = 'center';
      bgDrop.style.color = 'transparent';
    } else {
      bgDrop.style.backgroundImage = '';
      bgDrop.style.color = '#475569';
    }
  }

  const charDrop = document.getElementById('character-drop') as HTMLDivElement | null;
  if (charDrop) {
    const url = charPreviewUrls[currentIndex] ?? null;
    if (url) {
      charDrop.style.backgroundImage = `url(${url})`;
      charDrop.style.backgroundSize = 'cover';
      charDrop.style.backgroundPosition = 'center';
      charDrop.style.color = 'transparent';
    } else {
      charDrop.style.backgroundImage = '';
      charDrop.style.color = '#475569';
    }
  }

  refreshSharedDropZonePreview();
  renderChoices();
  renderSceneList();
}

// ========= シーン追加・削除 =========

/** 新しい空シーンを作成 */
function addNextScene(defaultNext: number): Scene {
  return {
    texts: [],
    next: defaultNext,
    backgroundName: '',
    showBackground: false,
    characterName: '',
    characterPicture: '',
    showCharacter: false,
    isTransitionToResult: false,
    eventPictureNum: 0,
    titleBackgroundName: sharedTitleBgName,
    resultBackgroundName: sharedResultBgName,
    choices: [],
  };
}

function recalcSceneNextAll() {
  scenes.forEach((scene, idx) => {
    scene.next = idx + 1;
  });
}

function deleteCurrentScene() {
  if (!scenes.length) return;

  const deleteIndex = currentIndex;

  scenes.splice(deleteIndex, 1);
  bgPreviewUrls.splice(deleteIndex, 1);
  charPreviewUrls.splice(deleteIndex, 1);

  if (!scenes.length) {
    currentIndex = 0;
    loadCurrentSceneToForm();
    return;
  }

  if (currentIndex >= scenes.length) {
    currentIndex = scenes.length - 1;
  }

  recalcSceneNextAll();
  loadCurrentSceneToForm();
}

// ========= 画像ドロップ（通常シーン用） =========

/** 画像ドロップ用：pictures/プレーン名 に変換して保持 */
function setupImageDropZone(dropId: string, inputId: string) {
  const dropZone = document.getElementById(dropId) as HTMLDivElement | null;
  const input = document.getElementById(inputId) as HTMLInputElement | null;

  if (!dropZone || !input) {
    console.warn('drop zone or input not found:', dropId, inputId);
    return;
  }

  const preventDefaults = (e: DragEvent | Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      preventDefaults(e as any);
    });
  });

  dropZone.addEventListener('dragover', () => {
    dropZone.style.borderColor = '#00aaff';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#888';
  });

  dropZone.addEventListener('drop', e => {
    const dt = (e as DragEvent).dataTransfer;
    if (!dt || dt.files.length === 0) return;

    const file = dt.files[0];

    if (!file?.type.startsWith('image/')) {
      alert('画像ファイルをドロップしてください');
      dropZone.style.borderColor = '#888';
      return;
    }

    const fileName = file.name;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const jsonName = `pictures/${baseName}`;
    const objectUrl = URL.createObjectURL(file);

    input.value = jsonName;

    dropZone.style.backgroundImage = `url(${objectUrl})`;
    dropZone.style.backgroundSize = 'cover';
    dropZone.style.backgroundPosition = 'center';
    dropZone.style.color = 'transparent';

    if (scenes.length > 0 && currentIndex >= 0 && currentIndex < scenes.length) {
      const scene = scenes[currentIndex];
      if (!scene) {
        dropZone.style.borderColor = '#888';
        return;
      }

      if (inputId === 'backgroundName') {
        bgPreviewUrls[currentIndex] = objectUrl;
        scene.backgroundName = jsonName;
        scene.showBackground = true;
        const cb = document.getElementById('showBackground') as HTMLInputElement | null;
        if (cb) cb.checked = true;
      }

      if (inputId === 'characterPicture') {
        charPreviewUrls[currentIndex] = objectUrl;
        scene.characterPicture = jsonName;
        scene.showCharacter = true;
        const cb = document.getElementById('showCharacter') as HTMLInputElement | null;
        if (cb) cb.checked = true;
      }
    }

    dropZone.style.borderColor = '#888';
    renderSceneList();
  });

  if (!dropZone.style.borderWidth) {
    dropZone.style.border = '2px dashed #888';
  }
}

// ========= 画像ドロップ（タイトル／結果共有用） =========

function setupSharedDropZone(
  dropId: string,
  inputId: string,
  assignCallback: (jsonName: string, objectUrl: string) => void
) {
  const dropZone = document.getElementById(dropId) as HTMLDivElement | null;
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!dropZone || !input) return;

  const preventDefaults = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, preventDefaults)
  );

  dropZone.addEventListener('dragover', () => {
    dropZone.style.borderColor = '#00aaff';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#888';
  });

  dropZone.addEventListener('drop', e => {
    const dt = (e as DragEvent).dataTransfer;
    if (!dt || dt.files.length === 0) return;

    const file = dt.files[0];
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルをドロップしてください');
      dropZone.style.borderColor = '#888';
      return;
    }

    const fileName = file.name;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const jsonName = `pictures/${baseName}`;
    const objectUrl = URL.createObjectURL(file);

    input.value = jsonName;

    dropZone.style.backgroundImage = `url(${objectUrl})`;
    dropZone.style.backgroundSize = 'cover';
    dropZone.style.backgroundPosition = 'center';
    dropZone.style.color = 'transparent';

    dropZone.style.borderColor = '#888';

    assignCallback(jsonName, objectUrl);
    refreshSharedDropZonePreview();
  });

  dropZone.style.border = '2px dashed #888';
}

// ========= プレビュー =========

/** シーンプレビュー（簡易ノベル風） */
function showScenePreview(scene: Scene) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15,23,42,0.65)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  const modal = document.createElement('div');
  modal.style.background = '#111827';
  modal.style.borderRadius = '12px';
  modal.style.boxShadow = '0 20px 40px rgba(0,0,0,0.45)';
  modal.style.width = '640px';
  modal.style.maxWidth = '90%';
  modal.style.height = '360px';
  modal.style.maxHeight = '80%';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.color = '#e5e7eb';
  modal.style.position = 'relative';
  modal.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.style.padding = '10px 14px';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.fontSize = '12px';
  header.style.background = '#020617';

  const title = document.createElement('div');
  title.textContent = `シーンプレビュー  (背景: ${scene.backgroundName || 'なし'} / キャラ: ${
    scene.characterName || 'なし'
  })`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.color = '#9ca3af';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';

  header.appendChild(title);
  header.appendChild(closeBtn);

  const stage = document.createElement('div');
  stage.style.flex = '1';
  stage.style.display = 'flex';
  stage.style.flexDirection = 'column';
  stage.style.background = '#0f172a';

  const bg = document.createElement('div');
  bg.style.flex = '1';
  bg.style.background = '#1f2937';
  bg.style.display = 'flex';
  bg.style.alignItems = 'center';
  bg.style.justifyContent = 'center';
  bg.style.color = '#9ca3af';
  bg.style.fontSize = '13px';
  bg.style.position = 'relative';

  const bgUrl = bgPreviewUrls[currentIndex] ?? null;
  const charUrl = charPreviewUrls[currentIndex] ?? null;

  if (scene.showBackground && bgUrl) {
    bg.style.backgroundImage = `url(${bgUrl})`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.textContent = '';
  } else {
    bg.style.backgroundImage = '';
    bg.textContent = scene.showBackground
      ? scene.backgroundName || '背景(名前未設定)'
      : '背景非表示';
  }

  if (charUrl) {
    const charImg = document.createElement('img');
    charImg.src = charUrl;
    charImg.style.position = 'absolute';
    charImg.style.left = '50%';
    charImg.style.transform = 'translateX(-50%)';
    charImg.style.bottom = '8px';
    charImg.style.maxHeight = '80%';
    charImg.style.objectFit = 'contain';
    charImg.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))';
    bg.appendChild(charImg);
  }

  const textBox = document.createElement('div');
  textBox.style.minHeight = '90px';
  textBox.style.background = 'rgba(15,23,42,0.95)';
  textBox.style.borderTop = '1px solid #374151';
  textBox.style.padding = '10px 14px';
  textBox.style.fontSize = '13px';
  textBox.style.display = 'flex';
  textBox.style.flexDirection = 'column';
  textBox.style.gap = '6px';

  const nameLine = document.createElement('div');
  nameLine.style.fontWeight = '600';
  nameLine.style.color = '#fbbf24';
  nameLine.textContent = scene.characterName && charUrl ? scene.characterName : '';

  const textLine = document.createElement('div');
  textLine.textContent = scene.texts.join('\n');

  textBox.appendChild(nameLine);
  textBox.appendChild(textLine);

  const choiceArea = document.createElement('div');
  choiceArea.style.padding = '6px 14px 10px';
  choiceArea.style.display = 'flex';
  choiceArea.style.gap = '8px';

  if (scene.choices && scene.choices.length > 0) {
    scene.choices.forEach(c => {
      const btn = document.createElement('button');
      btn.textContent = c.text || '（テキスト未設定）';
      btn.style.border = 'none';
      btn.style.borderRadius = '999px';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '12px';
      btn.style.cursor = 'pointer';
      btn.style.background = '#2563eb';
      btn.style.color = '#fff';
      btn.style.whiteSpace = 'nowrap';
      choiceArea.appendChild(btn);
    });
  } else {
    const noChoice = document.createElement('div');
    noChoice.textContent = '選択肢なし';
    noChoice.style.fontSize = '11px';
    noChoice.style.color = '#9ca3af';
    choiceArea.appendChild(noChoice);
  }

  stage.appendChild(bg);
  stage.appendChild(textBox);
  stage.appendChild(choiceArea);

  modal.appendChild(header);
  modal.appendChild(stage);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    document.body.removeChild(overlay);
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
}

// ========= エントリーポイント =========

window.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-file-btn') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('save-file-btn') as HTMLButtonElement | null;
  const prevBtn = document.getElementById('prev-scene-btn') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-scene-btn') as HTMLButtonElement | null;
  const addNextSceneBtn = document.getElementById('addNextScene') as HTMLButtonElement | null;
  const deleteSceneBtn = document.getElementById('delete-scene-btn') as HTMLButtonElement | null;
  const pathSpan = document.getElementById('file-path') as HTMLSpanElement | null;
  const addChoiceBtn = document.getElementById('add-choice-btn') as HTMLButtonElement | null;
  const previewBtn = document.getElementById('preview-scene-btn') as HTMLButtonElement | null;
  const sceneListEl = document.getElementById('scene-list') as HTMLDivElement | null;

  // 手動で「新しいシナリオ JSON だけ作る」ボタン
  // const createChoiceJsonBtn = document.getElementById(
  //   'create-choice-json-btn'
  // ) as HTMLButtonElement | null;

  const api = (window as any).fileApi2 as FileApi | undefined;

  if (!api) {
    alert('preload から fileApi2 が渡ってきていません');
    return;
  }

  // ドロップゾーン初期化
  setupImageDropZone('background-drop', 'backgroundName');
  setupImageDropZone('character-drop', 'characterPicture');

  // タイトル／結果背景ドロップゾーン
  setupSharedDropZone('title-bg-drop', 'titleBackgroundName', (jsonName, objectUrl) => {
    sharedTitleBgName = jsonName;
    titleBgPreviewUrl = objectUrl;
    scenes.forEach(s => (s.titleBackgroundName = jsonName));
    refreshSharedDropZonePreview();
  });

  setupSharedDropZone('result-bg-drop', 'resultBackgroundName', (jsonName, objectUrl) => {
    sharedResultBgName = jsonName;
    resultBgPreviewUrl = objectUrl;
    scenes.forEach(s => (s.resultBackgroundName = jsonName));
    refreshSharedDropZonePreview();
  });

  // シーン一覧：クリックで移動、ダブルクリックでプレビュー
  if (sceneListEl) {
    sceneListEl.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const item = target.closest('.scene-list-item') as HTMLDivElement | null;
      if (!item) return;
      const idxStr = item.dataset.index;
      if (idxStr == null) return;

      saveFormToCurrentScene();
      currentIndex = Number(idxStr);
      loadCurrentSceneToForm();
    });

    sceneListEl.addEventListener('dblclick', e => {
      const target = e.target as HTMLElement;
      const item = target.closest('.scene-list-item') as HTMLDivElement | null;
      if (!item) return;
      const idxStr = item.dataset.index;
      if (idxStr == null) return;

      const idx = Number(idxStr);
      const scene = scenes[idx];
      if (scene) {
        currentIndex = idx;
        loadCurrentSceneToForm();
        showScenePreview(scene);
      }
    });
  }

  // ファイルを開く
  openBtn?.addEventListener('click', async () => {
    const result = await api.openFile();
    // ★ キャンセルだけチェック。content の有無では return しない
    if (result.canceled) return;

    // ★ まず前回状態を完全リセット
    scenes = [];
    bgPreviewUrls = [];
    charPreviewUrls = [];
    sharedTitleBgName = '';
    sharedResultBgName = '';
    titleBgPreviewUrl = null;
    resultBgPreviewUrl = null;
    currentIndex = 0;

    currentPath = result.filePath ?? null;
    if (pathSpan) pathSpan.textContent = currentPath ?? '(なし)';

    // 同じディレクトリの JSON 一覧
    jsonFileOptions = [];
    if (currentPath && api.listJsonFilesInSameDir) {
      try {
        jsonFileOptions = await api.listJsonFilesInSameDir(currentPath);
      } catch (err) {
        console.error('JSON ファイル一覧の取得に失敗:', err);
      }
    }

    // ★ content が空 or 空白だけなら「空 JSON」として初期シーンだけ作る
    const raw = (result.content ?? '').trim();
    if (raw === '') {
      // 空ファイル → 空のシーン1つだけ作成
      scenes.push(addNextScene(1));
      bgPreviewUrls.push(null);
      charPreviewUrls.push(null);

      sharedTitleBgName = '';
      sharedResultBgName = '';

      const titleInputEl = document.getElementById(
        'titleBackgroundName'
      ) as HTMLInputElement | null;
      const resultInputEl = document.getElementById(
        'resultBackgroundName'
      ) as HTMLInputElement | null;
      if (titleInputEl) titleInputEl.value = '';
      if (resultInputEl) resultInputEl.value = '';

      refreshSharedDropZonePreview();
      loadCurrentSceneToForm();
      return;
    }

    // ここから先は「中身のある JSON ファイル」用の処理
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        alert('このエディタは「配列 JSON」専用です。 [ { ... }, { ... } ] 形式にしてください。');
        return;
      }

      scenes = parsed.map((rawScene: any, index: number): Scene => ({
        texts: rawScene.texts ?? [],
        next: rawScene.next ?? index + 1,
        backgroundName: rawScene.backgroundName ?? '',
        showBackground: rawScene.showBackground ?? false,
        characterName: rawScene.characterName ?? '',
        characterPicture: rawScene.characterPicture ?? '',
        showCharacter: rawScene.showCharacter ?? false,
        isTransitionToResult: rawScene.isTransitionToResult ?? false,
        eventPictureNum: rawScene.eventPictureNum ?? 0,
        titleBackgroundName: rawScene.titleBackgroundName ?? '',
        resultBackgroundName: rawScene.resultBackgroundName ?? '',
        choices: (rawScene.choices ?? []).map((c: any): Choice => ({
          text: c?.text ?? '',
          nextFile: c?.nextFile ?? '',
        })),
      }));

      if (!scenes.length) {
        scenes.push(addNextScene(1));
      }

      // 共有タイトル・結果背景の復元
      sharedTitleBgName =
        scenes.find(s => s.titleBackgroundName)?.titleBackgroundName ?? '';
      sharedResultBgName =
        scenes.find(s => s.resultBackgroundName)?.resultBackgroundName ?? '';

      // プレビューURL を JSON から復元
      await initPreviewUrlsFromJson(api, currentPath);

      const titleInputEl = document.getElementById(
        'titleBackgroundName'
      ) as HTMLInputElement | null;
      const resultInputEl = document.getElementById(
        'resultBackgroundName'
      ) as HTMLInputElement | null;
      if (titleInputEl) titleInputEl.value = sharedTitleBgName;
      if (resultInputEl) resultInputEl.value = sharedResultBgName;

      refreshSharedDropZonePreview();

      currentIndex = 0;
      loadCurrentSceneToForm();
    } catch (e) {
      console.error('JSON 読み込み処理でエラー:', e);
      alert('JSON の読み込み処理でエラーが発生しました。（詳細は DevTools のコンソールを見てください）');
    }
  });

  // 前のシーン
  prevBtn?.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex > 0) currentIndex--;
    loadCurrentSceneToForm();
  });

  // 次のシーン
  nextBtn?.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex < scenes.length - 1) currentIndex++;
    loadCurrentSceneToForm();
  });

  // // シーン追加
  // addNextSceneBtn?.addEventListener('click', () => {
  //   const newIndex = scenes.length;
  //   const defaultNext = newIndex + 1;

  //   scenes.push(addNextScene(defaultNext));
  //   bgPreviewUrls.push(null);
  //   charPreviewUrls.push(null);

  //   currentIndex = scenes.length - 1;
  //   loadCurrentSceneToForm();
  // });

  // シーン追加
addNextSceneBtn?.addEventListener('click', () => {
  // まず今のシーンの入力内容を保存
  if (scenes.length > 0) {
    saveFormToCurrentScene();
  }

  const newIndex = scenes.length;
  const defaultNext = newIndex + 1;

  scenes.push(addNextScene(defaultNext));
  bgPreviewUrls.push(null);
  charPreviewUrls.push(null);

  // 追加したシーンにカーソルを移動
  currentIndex = scenes.length - 1;
  loadCurrentSceneToForm();
});


  // シーン削除
  deleteSceneBtn?.addEventListener('click', () => {
    if (!scenes.length) return;
    deleteCurrentScene();
  });


// 選択肢追加：クリック → シーン名入力ダイアログ → その名前で JSON 作成
addChoiceBtn?.addEventListener('click', async () => {
  if (!scenes.length) {
    alert('シーンがありません');
    return;
  }

  const scene = scenes[currentIndex];
  if (!scene) return;

  if (scene.choices.length >= 2) {
    alert('選択肢は1シーンにつき最大2つまでです。');
    return;
  }

  if (!currentPath) {
    alert('先にシナリオ JSON を開いてください。');
    return;
  }

  if (!api.createEmptyJsonInSameDir) {
    alert('createEmptyJsonInSameDir が preload 側で未実装です。');
    return;
  }

  // ====== シーン名入力ダイアログ ======
  const inputName = await showNameInputDialog(
    '次のシーン JSON の名前',
    '作成するシーン（JSONファイル）の名前を入力してください（例: battle_start）'
  );

  // キャンセル or 空文字なら何もしない
  if (!inputName) {
    return;
  }

  // .json が付いていたら外す
  let baseName = inputName.trim().replace(/\.json$/i, '');
  if (!baseName) return;

  try {
    // 同じディレクトリに空 JSON を作成（中身は []）
    const result = await api.createEmptyJsonInSameDir(currentPath, baseName);
    console.log('created empty json:', result);

    // 実際に作られたファイル名（重複時は xxx_1.json などになる想定）
    const createdFileName = result.fileName;
    const createdBaseName = createdFileName.replace(/\.json$/i, '');

    // JSON 一覧を更新（プルダウン用）
    if (api.listJsonFilesInSameDir) {
      try {
        jsonFileOptions = await api.listJsonFilesInSameDir(currentPath);
      } catch (e) {
        console.error('listJsonFilesInSameDir 失敗:', e);
        if (!jsonFileOptions.includes(createdFileName)) {
          jsonFileOptions.push(createdFileName);
        }
      }
    } else {
      if (!jsonFileOptions.includes(createdFileName)) {
        jsonFileOptions.push(createdFileName);
      }
    }

    // 作った JSON をこの選択肢の nextFile にセット
    const nextFileKey = `jsonAsset/${createdBaseName}`;
    scene.choices.push({
      text: '',
      nextFile: nextFileKey,
    });

    renderChoices();
    renderSceneList();
  } catch (err) {
    console.error('空の JSON 作成でエラー:', err);
    alert('空の JSON ファイルの作成に失敗しました。コンソールを確認してください。');
  }
});



  // // ★ 手動で「新しい JSON ファイルだけ」作るボタン
  // createChoiceJsonBtn?.addEventListener('click', async () => {
  //   if (!currentPath) {
  //     alert('まず編集中のシナリオ JSON ファイルを開いてください。');
  //     return;
  //   }
  //   if (!api.createEmptyJsonInSameDir) {
  //     alert('createEmptyJsonInSameDir が preload 側で未実装です。');
  //     return;
  //   }

  //   try {
  //     // ベース名は new_scenario。重複していれば main 側で new_scenario_1… になる
  //     const result = await api.createEmptyJsonInSameDir(currentPath, 'new_scenario');

  //     // 同じディレクトリの JSON 一覧を更新
  //     if (api.listJsonFilesInSameDir) {
  //       try {
  //         jsonFileOptions = await api.listJsonFilesInSameDir(currentPath);
  //       } catch (err) {
  //         console.error('JSON ファイル一覧の再取得に失敗:', err);
  //         if (!jsonFileOptions.includes(result.fileName)) {
  //           jsonFileOptions.push(result.fileName);
  //         }
  //       }
  //     } else {
  //       if (!jsonFileOptions.includes(result.fileName)) {
  //         jsonFileOptions.push(result.fileName);
  //       }
  //     }

  //     renderChoices(); // プルダウン更新
  //     alert(`新しい JSON を作成しました: ${result.fileName}`);
  //   } catch (err) {
  //     console.error('createEmptyJsonInSameDir エラー:', err);
  //     alert('JSON ファイルの作成中にエラーが発生しました。');
  //   }
  // });


  // ★ 手動で「新しい JSON ファイルだけ」作るボタン
// createChoiceJsonBtn?.addEventListener('click', async () => {
//   if (!currentPath) {
//     alert('まず編集中のシナリオ JSON ファイルを開いてください。');
//     return;
//   }
//   if (!api.createEmptyJsonInSameDir) {
//     alert('createEmptyJsonInSameDir が preload 側で未実装です。');
//     return;
//   }

//   // ▼ 任意のファイル名を入力するテキストボックス（後述の HTML）から取得
//   const nameInput = document.getElementById('new-json-name') as HTMLInputElement | null;
//   let baseName = nameInput?.value.trim() || 'new_scenario';

//   // ユーザーが .json まで書いていても OK にする
//   baseName = baseName.replace(/\.json$/i, '');
//   if (!baseName) baseName = 'new_scenario';

//   try {
//     // ベース名 baseName で空 JSON を作成
//     const result = await api.createEmptyJsonInSameDir(currentPath, baseName);

//     // 同じディレクトリの JSON 一覧を更新
//     if (api.listJsonFilesInSameDir) {
//       try {
//         jsonFileOptions = await api.listJsonFilesInSameDir(currentPath);
//       } catch (err) {
//         console.error('JSON ファイル一覧の再取得に失敗:', err);
//         if (!jsonFileOptions.includes(result.fileName)) {
//           jsonFileOptions.push(result.fileName);
//         }
//       }
//     } else {
//       if (!jsonFileOptions.includes(result.fileName)) {
//         jsonFileOptions.push(result.fileName);
//       }
//     }

//     renderChoices(); // プルダウン更新
//     alert(`新しい JSON を作成しました: ${result.fileName}`);
//   } catch (err) {
//     console.error('createEmptyJsonInSameDir エラー:', err);
//     alert('JSON ファイルの作成中にエラーが発生しました。');
//   }
// });


  // 選択肢入力の変更を反映（input / select）
  document.addEventListener('input', e => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;

    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }

    const indexAttr = (target as HTMLElement).dataset.choiceIndex;
    const field = (target as HTMLElement).dataset.field;

    if (indexAttr === undefined || !field) return;
    if (!scenes.length) return;

    const idx = Number(indexAttr);
    const scene = scenes[currentIndex];
    const choice = scene?.choices[idx];
    if (!choice) return;

    if (field === 'text') choice.text = target.value;
    if (field === 'nextFile') choice.nextFile = target.value;

    renderSceneList();
  });

  // 選択肢削除
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const deleteIndex = target.dataset.deleteChoice;
    if (deleteIndex === undefined) return;
    if (!scenes.length) return;

    const idx = Number(deleteIndex);
    const scene = scenes[currentIndex];
    if (!scene?.choices[idx]) return;

    scene.choices.splice(idx, 1);
    renderChoices();
    renderSceneList();
  });

  // プレビューボタン
  previewBtn?.addEventListener('click', () => {
    if (!scenes.length) {
      alert('シーンがありません');
      return;
    }
    saveFormToCurrentScene();
    const scene = scenes[currentIndex];
    if (scene) showScenePreview(scene);
  });

  // 保存
  saveBtn?.addEventListener('click', async () => {
    if (!currentPath) {
      alert('まだファイルが開かれていません');
      return;
    }
    if (!scenes.length) {
      alert('シーンがありません');
      return;
    }

    saveFormToCurrentScene();

    const pretty = JSON.stringify(scenes, null, 2);
    await api.saveFile(currentPath, pretty);
    alert('保存しました！');
  });
});
