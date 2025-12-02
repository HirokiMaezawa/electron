// src/renderer.ts

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
  nextIndex: number;
};

type FileApi = {
  openFile: () => Promise<OpenFileResult>;
  saveFile: (filePath: string, content: string) => Promise<{ ok: boolean }>;
};

let currentPath: string | null = null;
let scenes: Scene[] = [];
let currentIndex = 0;

// ★ シーンごとの背景・キャラ画像プレビュー用 URL（JSON には書き込まない）
let bgPreviewUrls: (string | null)[] = [];
let charPreviewUrls: (string | null)[] = [];

/**
 * ★ 現在のフォーム内容を、現在のシーンオブジェクトに反映
 */
function saveFormToCurrentScene() {
  if (!scenes.length) return;

  const scene = scenes[currentIndex];

  const text1 = (document.getElementById('text1') as HTMLInputElement).value;
  const text2 = (document.getElementById('text2') as HTMLInputElement).value;
  const next = Number((document.getElementById('next') as HTMLInputElement).value);
  const bgName = (document.getElementById('backgroundName') as HTMLInputElement).value;
  const charName = (document.getElementById('characterName') as HTMLInputElement).value;
  const charPic = (document.getElementById('characterPicture') as HTMLInputElement).value;
  const showBg = (document.getElementById('showBackground') as HTMLInputElement).checked;
  const showChar = (document.getElementById('showCharacter') as HTMLInputElement).checked;
  const isResult = (document.getElementById('isTransitionToResult') as HTMLInputElement).checked;

  if (scene) {
    scene.texts = [text1, text2].filter(t => t !== '');
    scene.next = next;
    scene.backgroundName = bgName;
    scene.characterName = charName;
    scene.characterPicture = charPic;
    scene.showBackground = showBg;
    scene.showCharacter = showChar;
    scene.isTransitionToResult = isResult;
    // choices はリアルタイムに更新しているのでここでは触らない
  }
}

/**
 * ★ 選択肢一覧を描画
 */
function renderChoices() {
  const container = document.getElementById('choices-container') as HTMLDivElement | null;
  if (!container) return;

  container.innerHTML = '';

  if (!scenes.length || currentIndex < 0 || currentIndex >= scenes.length) {
    container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    return;
  }

  const scene = scenes[currentIndex];
  const choices = scene.choices ?? [];

  if (!choices.length) {
    container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    return;
  }

  choices.forEach((choice, idx) => {
    const div = document.createElement('div');
    div.className = 'choice-item';

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
        <input
          data-choice-index="${idx}"
          data-field="nextFile"
          type="text"
          value="${choice.nextFile ?? ''}"
        />
      </label><br/>
      <label>次インデックス:
        <input
          data-choice-index="${idx}"
          data-field="nextIndex"
          type="number"
          value="${choice.nextIndex ?? 0}"
        />
      </label>
    `;

    container.appendChild(div);
  });
}

/**
 * ★ 現在のシーンをフォームに表示
 */
function loadCurrentSceneToForm() {
  const indexLabel = document.getElementById('scene-index') as HTMLSpanElement;
  const totalLabel = document.getElementById('scene-total') as HTMLSpanElement;

  if (!scenes.length) {
    indexLabel.textContent = '0';
    totalLabel.textContent = '0';
    const container = document.getElementById('choices-container') as HTMLDivElement | null;
    if (container) {
      container.innerHTML = '<div class="choices-empty">このシーンには、まだ選択肢がありません。</div>';
    }
    return;
  }

  const scene = scenes[currentIndex];

  indexLabel.textContent = String(currentIndex + 1);
  totalLabel.textContent = String(scenes.length);

  const t1 = scene?.texts[0] ?? '';
  const t2 = scene?.texts[1] ?? '';

  (document.getElementById('text1') as HTMLInputElement).value = t1;
  (document.getElementById('text2') as HTMLInputElement).value = t2;
  (document.getElementById('next') as HTMLInputElement).value = String(scene?.next ?? 0);
  (document.getElementById('backgroundName') as HTMLInputElement).value = scene?.backgroundName ?? '';
  (document.getElementById('characterName') as HTMLInputElement).value = scene?.characterName ?? '';
  (document.getElementById('characterPicture') as HTMLInputElement).value =
    scene?.characterPicture ?? '';
  (document.getElementById('showBackground') as HTMLInputElement).checked =
    scene?.showBackground ?? true;
  (document.getElementById('showCharacter') as HTMLInputElement).checked =
    scene?.showCharacter ?? true;
  (document.getElementById('isTransitionToResult') as HTMLInputElement).checked =
    scene?.isTransitionToResult ?? false;

  // ★ ドロップゾーンの見た目も、プレビュー URL に合わせて更新
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

  // ★ シーンが切り替わったら選択肢UIも更新
  renderChoices();
}

/**
 * ★ 新しい空シーンを作成（デフォルト next を指定）
 */
function addNextScene(defaultNext: number): Scene {
  const parts: Scene = {
    texts: [],
    next: defaultNext,           // ← デフォルト next = 「自分の次」
    backgroundName: '',
    showBackground: false,
    characterName: '',
    characterPicture: '',
    showCharacter: false,
    isTransitionToResult: false,
    eventPictureNum: 0,
    choices: [],
  };
  return parts;
}

/**
 * ★ 画像ドロップ用の共通ヘルパー
 *   - ファイル名は input に入れる（JSON 用）
 *   - ObjectURL は bgPreviewUrls / charPreviewUrls に覚えてプレビュー用に使う
 */
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

    // ★ ブラウザ的な安全な URL を作る（メモリ上だけで使う）
    const objectUrl = URL.createObjectURL(file);

    // input にファイル名（JSON 用）をセット
    input.value = fileName;
    console.log(`[${dropId}] dropped:`, fileName);

    // ドロップゾーン自体にもサムネイル表示
    dropZone.style.backgroundImage = `url(${objectUrl})`;
    dropZone.style.backgroundSize = 'cover';
    dropZone.style.backgroundPosition = 'center';
    dropZone.style.color = 'transparent';

    // 今のシーンのプレビュー用 URL を更新（JSON には書かない）
    if (scenes.length > 0 && currentIndex >= 0 && currentIndex < scenes.length) {
      if (inputId === 'backgroundName') {
        bgPreviewUrls[currentIndex] = objectUrl;
        scenes[currentIndex].backgroundName = fileName;
      }

      if (inputId === 'characterPicture') {
        charPreviewUrls[currentIndex] = objectUrl;
        scenes[currentIndex].characterPicture = fileName;
      }
    }

    dropZone.style.borderColor = '#888';
  });

  if (!dropZone.style.borderWidth) {
    dropZone.style.border = '2px dashed #888';
  }
}

/**
 * ★ シーンプレビュー（簡易ノベル風ダイアログ）
 */
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

  // ★ 今のシーン用のプレビュー URL を参照
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

  // ★ キャラ画像があれば右下に表示
  if (scene.showCharacter && charUrl) {
    const charImg = document.createElement('img');
    charImg.src = charUrl;
    charImg.style.position = 'absolute';
    charImg.style.bottom = '8px';
    charImg.style.right = '10px';
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
  nameLine.textContent = scene.showCharacter
    ? scene.characterName || '(キャラ名未設定)'
    : '';

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

/**
 * ★ エントリーポイント
 */
window.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
  const saveBtn = document.getElementById('save-file-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('prev-scene-btn') as HTMLButtonElement;
  const nextBtn = document.getElementById('next-scene-btn') as HTMLButtonElement;
  const addNextSceneBtn = document.getElementById('addNextScene') as HTMLButtonElement;
  const pathSpan = document.getElementById('file-path') as HTMLSpanElement;
  const addChoiceBtn = document.getElementById('add-choice-btn') as HTMLButtonElement | null;
  const previewBtn = document.getElementById('preview-scene-btn') as HTMLButtonElement | null;

  // ★ preload 側が exposeInMainWorld('fileApi2', ...) で出している前提
  const api = (window as any).fileApi2 as FileApi | undefined;

  if (!api) {
    alert('preload から fileApi2 が渡ってきていません');
    return;
  }

  // ★ ドロップゾーン初期化
  setupImageDropZone('background-drop', 'backgroundName');
  setupImageDropZone('character-drop', 'characterPicture');

  // ▼ ファイルを開く
  openBtn.addEventListener('click', async () => {
    const result = await api.openFile();
    if (result.canceled || !result.content) return;

    currentPath = result.filePath ?? null;
    pathSpan.textContent = currentPath ?? '(なし)';

    try {
      const parsed = JSON.parse(result.content);
      if (!Array.isArray(parsed)) {
        alert('このエディタは「配列 JSON」専用です。 [ { ... }, { ... } ] 形式にしてください。');
        return;
      }

      // choices / next がなくても動くように正規化
      scenes = parsed.map((raw: any, index: number) => {
        const scene: Scene = {
          texts: raw.texts ?? [],
          // next が未定義なら「自分の次のシーン番号」をデフォルトにする
          next: raw.next ?? (index + 1),
          backgroundName: raw.backgroundName ?? '',
          showBackground: raw.showBackground ?? false,
          characterName: raw.characterName ?? '',
          characterPicture: raw.characterPicture ?? '',
          showCharacter: raw.showCharacter ?? false,
          isTransitionToResult: raw.isTransitionToResult ?? false,
          eventPictureNum: raw.eventPictureNum ?? 0,
          // ★ choices も1件ずつ正規化（nextIndex 無ければ 0）
          choices: (raw.choices ?? []).map((c: any): Choice => ({
            text: c?.text ?? '',
            nextFile: c?.nextFile ?? '',
            nextIndex: c?.nextIndex ?? 0,
          })),
        };
        return scene;
      });

      // ★ プレビュー用 URL 配列を初期化（全 null）
      bgPreviewUrls = new Array(scenes.length).fill(null);
      charPreviewUrls = new Array(scenes.length).fill(null);

      currentIndex = 0;
      loadCurrentSceneToForm();
    } catch (e) {
      console.error(e);
      alert('JSON のパースに失敗しました。');
    }
  });

  // ▼ 前のシーン
  prevBtn.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex > 0) currentIndex--;
    loadCurrentSceneToForm();
  });

  // ▼ 次のシーン
  nextBtn.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex < scenes.length - 1) currentIndex++;
    loadCurrentSceneToForm();
  });

  // ▼ シーン追加
  addNextSceneBtn.addEventListener('click', () => {
    const newIndex = scenes.length;       // 追加されるシーンのインデックス
    const defaultNext = newIndex + 1;     // デフォルト next = 「自分の次」

    scenes.push(addNextScene(defaultNext));
    // プレビュー用 URL も 1 件分追加
    bgPreviewUrls.push(null);
    charPreviewUrls.push(null);

    currentIndex = scenes.length - 1;
    loadCurrentSceneToForm();
  });

  // ▼ 選択肢追加（1シーン最大2つまで / nextIndex デフォルト 0）
  if (addChoiceBtn) {
    addChoiceBtn.addEventListener('click', () => {
      if (!scenes.length) return;
      const scene = scenes[currentIndex];

      if (scene.choices.length >= 2) {
        alert('選択肢は1シーンにつき最大2つまでです。');
        return;
      }

      scene.choices.push({
        text: '',
        nextFile: '',
        nextIndex: 0, // ← ここもデフォルト 0
      });
      renderChoices();
    });
  }

  // ▼ 選択肢入力の変更を反映
  document.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    const indexAttr = target.dataset.choiceIndex;
    const field = target.dataset.field;

    if (indexAttr === undefined || !field) return;
    if (!scenes.length) return;

    const idx = Number(indexAttr);
    const scene = scenes[currentIndex];
    const choice = scene.choices[idx];
    if (!choice) return;

    if (field === 'text') choice.text = target.value;
    if (field === 'nextFile') choice.nextFile = target.value;
    if (field === 'nextIndex') choice.nextIndex = Number(target.value);
  });

  // ▼ 選択肢削除
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const deleteIndex = target.dataset.deleteChoice;
    if (deleteIndex === undefined) return;
    if (!scenes.length) return;

    const idx = Number(deleteIndex);
    const scene = scenes[currentIndex];
    if (!scene.choices[idx]) return;

    scene.choices.splice(idx, 1);
    renderChoices();
  });

  // ▼ シーンプレビュー
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      if (!scenes.length) {
        alert('シーンがありません');
        return;
      }
      // 今のフォーム内容を反映してからプレビュー
      saveFormToCurrentScene();
      const scene = scenes[currentIndex];
      showScenePreview(scene);
    });
  }

  // ▼ 保存（全配列を上書き）
  saveBtn.addEventListener('click', async () => {
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
