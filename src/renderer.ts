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

// ★ フォームの値を現在のシーンに反映
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
  // const eventNum = Number((document.getElementById('eventPictureNum') as HTMLInputElement).value);

  if (scene) {
    scene.texts = [text1, text2].filter(t => t !== '');
    scene.next = next;
    scene.backgroundName = bgName;
    scene.characterName = charName;
    scene.characterPicture = charPic;
    scene.showBackground = showBg;
    scene.showCharacter = showChar;
    scene.isTransitionToResult = isResult;
    // scene.eventPictureNum = eventNum;
    // choices はリアルタイムに更新しているのでここでは触らない
  }
}

// ★ 選択肢一覧を描画
function renderChoices() {
  const container = document.getElementById('choices-container') as HTMLDivElement | null;
  if (!container) return;

  container.innerHTML = '';

  if (!scenes.length || currentIndex < 0 || currentIndex >= scenes.length) return;

  const scene = scenes[currentIndex];

  scene?.choices.forEach((choice, idx) => {
    const div = document.createElement('div');
    div.className = 'choice-item';
    div.style.border = '1px solid #ccc';
    div.style.padding = '8px';
    div.style.marginBottom = '8px';

    div.innerHTML = `
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
      </label><br/>
      <button data-delete-choice="${idx}">選択肢を削除</button>
    `;

    container.appendChild(div);
  });
}

// ★ 現在のシーンをフォームに表示
function loadCurrentSceneToForm() {
  const indexLabel = document.getElementById('scene-index') as HTMLSpanElement;
  const totalLabel = document.getElementById('scene-total') as HTMLSpanElement;

  if (!scenes.length) {
    indexLabel.textContent = '0';
    totalLabel.textContent = '0';
    // シーンがないときは選択肢も空に
    const container = document.getElementById('choices-container') as HTMLDivElement | null;
    if (container) container.innerHTML = '';
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
  (document.getElementById('characterPicture') as HTMLInputElement).value = scene?.characterPicture ?? '';
  (document.getElementById('showBackground') as HTMLInputElement).checked = scene?.showBackground ?? true;
  (document.getElementById('showCharacter') as HTMLInputElement).checked = scene?.showCharacter ?? true;
  (document.getElementById('isTransitionToResult') as HTMLInputElement).checked =
    scene?.isTransitionToResult ?? false;
  // (document.getElementById('eventPictureNum') as HTMLInputElement).value =
  //   String(scene?.eventPictureNum ?? 0);

  // ★ シーンが切り替わったら選択肢UIも更新
  renderChoices();
}

function addNextScene() {
  const parts: Scene = {
    texts: [],
    next: 0,
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

// 画像ドロップ用の共通ヘルパー
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

  // デフォルト動作（ファイルを開く等）を止める
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      preventDefaults(e);
    });
  });

  // 見た目ちょい演出
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

    // 画像だけ受け付けたい場合（いらなければこの if ごと消してOK）
    if (!file?.type.startsWith('image/')) {
      alert('画像ファイルをドロップしてください');
      dropZone.style.borderColor = '#888';
      return;
    }

    // ★ここが本命：ファイル名だけ欲しいので .name
    const fileName = file.name; // 例: "bg_room.png"

    // input にファイル名をセット
    input.value = fileName;
    console.log(`[${dropId}] dropped:`, fileName);

    if (scenes.length > 0 && currentIndex >= 0 && currentIndex < scenes.length) {
      const scene = scenes[currentIndex];

      if (inputId === 'backgroundName' && scene) {
        scene.backgroundName = fileName;
      }

      if (inputId === 'characterPicture' && scene) {
        scene.characterPicture = fileName;
      }
    }

    dropZone.style.borderColor = '#888';
  });

  // 初期枠スタイル（CSS任せならなくてもOK）
  if (!dropZone.style.borderWidth) {
    dropZone.style.border = '2px dashed #888';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
  const saveBtn = document.getElementById('save-file-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('prev-scene-btn') as HTMLButtonElement;
  const nextBtn = document.getElementById('next-scene-btn') as HTMLButtonElement;
  const addNextSceneBtn = document.getElementById('addNextScene') as HTMLButtonElement;
  const pathSpan = document.getElementById('file-path') as HTMLSpanElement;
  const addChoiceBtn = document.getElementById('add-choice-btn') as HTMLButtonElement | null;

  // ★ preload 側が exposeInMainWorld('fileApi', ...) ならここは fileApi に合わせる
  const api = (window as any).fileApi2 as FileApi | undefined;

  if (!api) {
    alert('preload から fileApi が渡ってきていません');
    return;
  }

  // ★ 背景＆キャラ用ドロップゾーンの初期化
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
      scenes = scenes = parsed.map((raw: any) => {
      const scene: Scene = {
        texts: raw.texts ?? [],
        next: raw.next ?? 0,
        backgroundName: raw.backgroundName ?? '',
        showBackground: raw.showBackground ?? false,
        characterName: raw.characterName ?? '',
        characterPicture: raw.characterPicture ?? '',
        showCharacter: raw.showCharacter ?? false,
        isTransitionToResult: raw.isTransitionToResult ?? false,
        eventPictureNum: raw.eventPictureNum ?? 0,
        choices: raw.choices ?? [],   // ← ここがポイント
      };
      return scene;
    });
      currentIndex = 0;
      loadCurrentSceneToForm();
    } catch (e) {
      console.error(e);
      alert('JSON のパースに失敗しました。');
    }
  });

  // ▼ 前の要素へ
  prevBtn.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex > 0) currentIndex--;
    loadCurrentSceneToForm();
  });

  // ▼ 次の要素へ
  nextBtn.addEventListener('click', () => {
    if (!scenes.length) return;
    saveFormToCurrentScene();
    if (currentIndex < scenes.length - 1) currentIndex++;
    loadCurrentSceneToForm();
  });

  // ▼ シーン追加
  addNextSceneBtn.addEventListener('click', () => {
    scenes.push(addNextScene());
    currentIndex = scenes.length - 1; // 追加したシーンに移動したほうがわかりやすいなら
    loadCurrentSceneToForm();
  });

  // ▼ 選択肢追加
  if (addChoiceBtn) {
    addChoiceBtn.addEventListener('click', () => {
      if (!scenes.length) return;
      const scene = scenes[currentIndex];
      scene?.choices.push({
        text: '',
        nextFile: '',
        nextIndex: 0,
      });
      renderChoices();
    });
  }

  // ▼ 選択肢入力の変更を反映（text / nextFile / nextIndex）
  document.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    const indexAttr = target.dataset.choiceIndex;
    const field = target.dataset.field;

    if (indexAttr === undefined || !field) return;
    if (!scenes.length) return;

    const idx = Number(indexAttr);
    const scene = scenes[currentIndex];
    const choice = scene?.choices[idx];
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
    if (!scene?.choices[idx]) return;

    scene.choices.splice(idx, 1);
    renderChoices();
  });

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

    saveFormToCurrentScene(); // 今表示中のシーンも反映

    const pretty = JSON.stringify(scenes, null, 2);
    await api.saveFile(currentPath, pretty);
    alert('保存しました！');
  });
});