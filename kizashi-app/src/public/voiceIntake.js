// 音声ガイド付き事前問診（企画整理.md の「事前問診フォーム」を音声でも
// 入力できるようにする機能）。floorplan.js と同じパターン：トップレベル
// 関数が要素idを受け取り、公開APIを返す。
//
// 重要：音声認識の書き起こしは一切AIに解釈させず、そのまま（verbatim）
// 採用する。このアプリの目的は「人づて伝言による情報の劣化」を無くすことで
// あり、AIが音声を要約・言い換えしてしまうと同じ問題をAIで再現してしまう
// ため。確認ステップも、認識エラーを積み重ねないよう音声ではなくタップで行う。

const VOICE_INTAKE_QUESTIONS = [
  { key: "name", fieldId: "intakeName", prompt: "お名前を教えてください。" },
  { key: "age", fieldId: "intakeAge", prompt: "年齢を教えてください。" },
  {
    key: "gender",
    fieldId: "intakeGender",
    prompt: "性別を教えてください。男性か女性かでお答えください。",
    kind: "gender",
  },
  {
    key: "lastSeen",
    fieldId: "intakeLastSeen",
    prompt: "最後に確認された場所と時刻を、分かる範囲で教えてください。",
  },
  { key: "heightBuild", fieldId: "intakeHeightBuild", prompt: "身長や体格の特徴を教えてください。" },
  { key: "hair", fieldId: "intakeHair", prompt: "髪型や髪の色を教えてください。" },
  {
    key: "glasses",
    fieldId: "intakeGlasses",
    prompt: "眼鏡をかけていますか。かけていれば教えてください。なければ「なし」とお答えください。",
  },
  { key: "clothing", fieldId: "intakeClothing", prompt: "最後に確認された時の服装を教えてください。" },
  {
    key: "medicationAllergy",
    fieldId: "intakeMedication",
    prompt: "服用中の薬やアレルギーがあれば教えてください。なければ「なし」とお答えください。",
  },
  { key: "mobility", fieldId: "intakeMobility", prompt: "歩行や移動は可能な方ですか。" },
];

function isVoiceIntakeSupported() {
  // window.SpeechRecognition / speechSynthesis は呼び出し時に毎回参照する
  // （読み込み時に定数キャッシュしない）。テスト時にスタブを注入しやすくするため。
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return !!(SpeechRecognitionCtor && window.speechSynthesis);
}

function normalizeGenderAnswer(transcript) {
  if (!transcript) return null;
  if (transcript.includes("女")) return "女性";
  if (transcript.includes("男")) return "男性";
  return null;
}

function initVoiceIntakeWidget({
  overlayId,
  questionTextId,
  progressId,
  statusId,
  transcriptId,
  choicesId,
  cancelBtnId,
  onFieldConfirmed,
}) {
  const overlay = document.getElementById(overlayId);
  const questionTextEl = document.getElementById(questionTextId);
  const progressEl = document.getElementById(progressId);
  const statusEl = document.getElementById(statusId);
  const transcriptEl = document.getElementById(transcriptId);
  const choicesEl = document.getElementById(choicesId);
  const cancelBtn = document.getElementById(cancelBtnId);

  let running = false;
  let currentRecognition = null;
  let pendingChoiceResolve = null;

  function setProgress(index, total) {
    progressEl.textContent = `${index} / ${total}`;
  }
  function setQuestionText(text) {
    questionTextEl.textContent = text;
  }
  function setStatus(text) {
    statusEl.textContent = text;
  }
  function clearTranscript() {
    transcriptEl.textContent = "";
  }
  function showTranscript(text) {
    transcriptEl.textContent = text;
  }

  function renderChoices(options) {
    choicesEl.innerHTML = "";
    return new Promise((resolve) => {
      pendingChoiceResolve = resolve;
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "big-btn" + (opt.style === "outline" ? " outline" : "");
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          pendingChoiceResolve = null;
          choicesEl.innerHTML = "";
          resolve(opt.value);
        });
        choicesEl.appendChild(btn);
      });
    });
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.rate = 0.92; // 柔らかく、ゆっくりめの話し方にする
      utterance.pitch = 0.98;
      utterance.onend = finish;
      utterance.onerror = finish;
      // speechSynthesis.onend が発火しない環境があるため、文字数に応じた
      // 保険のタイムアウトも必ず設定する（getGeolocation()と同じ二重防御方針）。
      setTimeout(finish, Math.max(2500, text.length * 220));
      window.speechSynthesis.speak(utterance);
    });
  }

  function listenOnce() {
    return new Promise((resolve) => {
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) return resolve(null);
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "ja-JP";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        // ブラウザの音声認識結果をそのまま採用する（verbatim）。
        // ここでAIによる要約・言い換え・補正は一切行わない。
        finish(event.results[0][0].transcript);
      };
      recognition.onerror = () => finish(null);
      recognition.onend = () => finish(null);
      currentRecognition = recognition;
      setTimeout(() => finish(null), 8000);
      try {
        recognition.start();
      } catch {
        finish(null);
      }
    });
  }

  function confirmValue(text) {
    return speak(`「${text}」でよろしいですか？`).then(() =>
      renderChoices([
        { label: "はい", value: true },
        { label: "いいえ、もう一度", value: false, style: "outline" },
      ])
    );
  }

  // 自由記述項目用の確認。聞き取り間違いは「もう一度話す」（再度音声認識）だけでなく、
  // その場でテキストを直接修正できるようにする（誤認識のたびに話し直すのは負担が大きいため）。
  // 戻り値は { ok, value }。ok=falseなら呼び出し元は再度askQuestion()する。
  function confirmTextValue(text) {
    return speak(`「${text}」でよろしいですか？`).then(() => renderConfirmWithEdit(text));
  }

  function renderConfirmWithEdit(text) {
    return new Promise((resolve) => {
      choicesEl.innerHTML = "";

      const yesBtn = document.createElement("button");
      yesBtn.type = "button";
      yesBtn.className = "big-btn";
      yesBtn.textContent = "はい";
      yesBtn.addEventListener("click", () => {
        choicesEl.innerHTML = "";
        resolve({ ok: true, value: text });
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "big-btn outline";
      editBtn.textContent = "文字で修正する";
      editBtn.addEventListener("click", () => resolve(renderEditInput(text)));

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "big-btn outline";
      retryBtn.textContent = "いいえ、もう一度話す";
      retryBtn.addEventListener("click", () => {
        choicesEl.innerHTML = "";
        resolve({ ok: false });
      });

      choicesEl.appendChild(yesBtn);
      choicesEl.appendChild(editBtn);
      choicesEl.appendChild(retryBtn);
    });
  }

  function renderEditInput(text) {
    return new Promise((resolve) => {
      choicesEl.innerHTML = "";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "voice-edit-input";
      input.value = text;

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "big-btn";
      confirmBtn.textContent = "この内容で確定";
      const submit = () => {
        const edited = input.value.trim();
        choicesEl.innerHTML = "";
        showTranscript(edited || text);
        resolve({ ok: true, value: edited || text });
      };
      confirmBtn.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });

      choicesEl.appendChild(input);
      choicesEl.appendChild(confirmBtn);
      input.focus();
      input.select();
    });
  }

  async function askQuestion(q) {
    if (!running) return null;
    setQuestionText(q.prompt);
    clearTranscript();
    await speak(q.prompt);
    if (!running) return null;

    if (q.kind === "gender") {
      setStatus("🎤 聞いています…");
      const transcript = await listenOnce();
      setStatus("");
      if (!running) return null;
      const normalized = normalizeGenderAnswer(transcript);
      if (normalized) {
        showTranscript(normalized);
        const ok = await confirmValue(normalized);
        if (!running) return null;
        if (ok) return normalized;
        return askQuestion(q);
      }
      showTranscript("聞き取れなかったため、ボタンでお選びください");
      const choice = await renderChoices([
        { label: "男性", value: "男性" },
        { label: "女性", value: "女性" },
      ]);
      if (!running) return null;
      return choice;
    }

    setStatus("🎤 聞いています…");
    const transcript = await listenOnce();
    setStatus("");
    if (!running) return null;
    if (!transcript || !transcript.trim()) {
      showTranscript("（聞き取れませんでした）");
      const choice = await renderChoices([
        { label: "もう一度話す", value: "retry" },
        { label: "この項目をとばす", value: "skip", style: "outline" },
      ]);
      if (!running) return null;
      if (choice === "retry") return askQuestion(q);
      return null;
    }
    showTranscript(transcript);
    const result = await confirmTextValue(transcript);
    if (!running) return null;
    if (!result.ok) return askQuestion(q);
    return result.value;
  }

  async function start() {
    if (running) return;
    running = true;
    overlay.style.display = "";
    for (let i = 0; i < VOICE_INTAKE_QUESTIONS.length; i++) {
      if (!running) break;
      const q = VOICE_INTAKE_QUESTIONS[i];
      setProgress(i + 1, VOICE_INTAKE_QUESTIONS.length);
      const value = await askQuestion(q);
      if (!running) break;
      if (value !== null && value !== undefined) {
        onFieldConfirmed(q.fieldId, value);
      }
    }
    if (running) {
      await speak("すべての質問が終わりました。内容をご確認のうえ、保存ボタンを押してください。");
    }
    stop();
  }

  function stop() {
    running = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentRecognition) {
      try {
        currentRecognition.abort();
      } catch {
        // 既に終了している場合などは無視してよい
      }
    }
    if (pendingChoiceResolve) {
      const resolve = pendingChoiceResolve;
      pendingChoiceResolve = null;
      resolve(null);
    }
    overlay.style.display = "none";
  }

  cancelBtn.addEventListener("click", stop);

  return { start, stop, isSupported: isVoiceIntakeSupported };
}
