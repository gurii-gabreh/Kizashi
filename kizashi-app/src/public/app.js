// 結（ゆい）アプリのフロントエンド本体。現場ルームの作成・参加、
// 事前問診フォーム・間取り手書き共有・前兆現象共有のAPI連携を行う。

const STORAGE_KEY = "kizashi_room_code";
const PRECURSOR_POLL_INTERVAL_MS = 15000; // 10〜30秒ごとのポーリング方針（企画整理.md セクション7）

const state = {
  roomCode: null,
  precursorTimer: null,
  voiceIntakeWidget: null,
  chatWidget: null,
};

function apiUrl(path) {
  return `/api/rooms/${state.roomCode}${path}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// ---- ルーム作成・参加 ----

async function createRoom() {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error("ルーム作成に失敗しました");
  const data = await res.json();
  return data.room_code;
}

async function verifyRoom(code) {
  const res = await fetch(`/api/rooms/${code}/verify`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.valid === true;
}

function setEntryError(msg) {
  const el = document.getElementById("entryError");
  el.textContent = msg;
  el.style.display = msg ? "" : "none";
}

function showEntryScreen() {
  document.getElementById("entryScreen").style.display = "";
  document.getElementById("mainApp").style.display = "none";
  if (state.precursorTimer) {
    clearInterval(state.precursorTimer);
    state.precursorTimer = null;
  }
  if (state.voiceIntakeWidget) {
    state.voiceIntakeWidget.stop();
  }
  if (state.chatWidget) {
    state.chatWidget.reset();
  }
}

function enterRoom(code) {
  state.roomCode = code;
  localStorage.setItem(STORAGE_KEY, code);
  document.getElementById("roomCode").textContent = code;
  document.getElementById("entryScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "";
  initMainApp();
}

document.getElementById("createRoomBtn").addEventListener("click", async () => {
  setEntryError("");
  try {
    const code = await createRoom();
    enterRoom(code);
  } catch (e) {
    setEntryError("ルームの作成に失敗しました。もう一度お試しください。");
  }
});

document.getElementById("joinRoomBtn").addEventListener("click", async () => {
  const code = document.getElementById("joinCodeInput").value.trim();
  if (!/^\d{6}$/.test(code)) {
    setEntryError("6桁の数字で入力してください");
    return;
  }
  setEntryError("");
  const ok = await verifyRoom(code);
  if (!ok) {
    setEntryError("そのコードのルームは見つかりませんでした");
    return;
  }
  enterRoom(code);
});

document.getElementById("leaveRoomBtn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.roomCode = null;
  document.getElementById("joinCodeInput").value = "";
  showEntryScreen();
});

// ---- タブ切り替え ----

function initTabs() {
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.view).classList.add("active");
      if (btn.dataset.view === "view-map" && window.map) {
        setTimeout(() => window.map.invalidateSize(), 50);
      }
    });
  });
}

// ---- 地図（危険エリア可視化）----
// prototype/doshasai-prototype.html の実データ統合ロジックをそのまま踏襲。

const sampleGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        現象の種類: "急傾斜地の崩壊",
        区域区分: "土砂災害特別警戒区域",
        区域名: "サンプル区域A（品川区想定）",
        所在地: "品川区某所",
        告示日: "2025-03-19",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[139.73, 35.61], [139.734, 35.61], [139.734, 35.613], [139.73, 35.613], [139.73, 35.61]]],
      },
    },
  ],
};

let precursorLayerGroup = null;

function initMap() {
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([35.65, 139.7], 11);
  window.map = map;

  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
    attribution: "地図：国土地理院",
    maxZoom: 18,
  }).addTo(map);

  // 前兆現象の報告地点（危険区域ポリゴンの上に重ねて表示する）
  precursorLayerGroup = L.layerGroup().addTo(map);

  function styleFor(f) {
    const isSpecial = f.properties["区域区分"] === "土砂災害特別警戒区域";
    return {
      color: isSpecial ? "#b3352a" : "#c98a1f",
      weight: 1.5,
      fillColor: isSpecial ? "#b3352a" : "#c98a1f",
      fillOpacity: 0.35,
    };
  }

  const zoneInfo = document.getElementById("zoneInfo");
  const dataSourceNote = document.getElementById("dataSourceNote");

  function renderZones(geojson) {
    L.geoJSON(geojson, {
      style: styleFor,
      onEachFeature: (feature, layer) => {
        layer.on("click", () => {
          const p = feature.properties;
          const isSpecial = p["区域区分"] === "土砂災害特別警戒区域";
          zoneInfo.className = "zone-info show " + (isSpecial ? "danger" : "warn");
          zoneInfo.innerHTML = `
            <dl style="margin:0">
              <dt>区分</dt><dd>${escapeHtml(p["区域区分"])}</dd><br>
              <dt>現象</dt><dd>${escapeHtml(p["現象の種類"])}</dd><br>
              <dt>所在地</dt><dd>${escapeHtml(p["所在地"])}</dd><br>
              <dt>告示日</dt><dd>${escapeHtml(p["告示日"])}</dd>
            </dl>`;
        });
      },
    }).addTo(map);
  }

  fetch("data/tokyo_23wards_sabo_zones.geojson")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((geojson) => {
      renderZones(geojson);
      dataSourceNote.className = "note mock";
      dataSourceNote.innerHTML = `✅ 実データを表示中：国土数値情報「土砂災害警戒区域データ」A33-22（東京都・令和4年度版）、23区内 ${geojson.features.length}件。`;
    })
    .catch((err) => {
      console.warn("実データの読み込みに失敗、サンプルデータを表示します:", err);
      renderZones(sampleGeoJSON);
      dataSourceNote.innerHTML = "⚠ 実データを読み込めなかったためサンプルデータを表示しています。";
    });
}

// 前兆現象の報告地点を、危険区域ポリゴンの上に赤いマーカーとして重ねて表示する。
// 位置情報が取得できなかった報告（latitude/longitudeがnull）は地図には出さず、
// 一覧（feedList）側にのみ表示される。
function renderPrecursorMarkers(precursors) {
  if (!precursorLayerGroup) return;
  precursorLayerGroup.clearLayers();

  for (const p of precursors) {
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number") continue;
    const who = p.reporter_name ? `${escapeHtml(p.reporter_name)}さん` : "匿名の報告";
    const marker = L.circleMarker([p.latitude, p.longitude], {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: "#b3352a",
      fillOpacity: 0.9,
    });
    marker.bindPopup(
      `<b>⚠️ 前兆現象の報告</b><br>${escapeHtml(p.sign_label)}<br><span style="color:#9aa1a6">${who}・${formatReportedAt(p.reported_at)}</span>`
    );
    marker.addTo(precursorLayerGroup);
  }
}

// ---- 事前問診フォーム ----

const INTAKE_FIELD_IDS = {
  name: "intakeName",
  age: "intakeAge",
  gender: "intakeGender",
  lastSeen: "intakeLastSeen",
  heightBuild: "intakeHeightBuild",
  hair: "intakeHair",
  glasses: "intakeGlasses",
  clothing: "intakeClothing",
  medicationAllergy: "intakeMedication",
  mobility: "intakeMobility",
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadIntake() {
  const res = await fetch(apiUrl("/intake"));
  if (!res.ok) return; // 404 = まだ未入力
  const data = await res.json();
  if (!data) return;
  for (const [key, id] of Object.entries(INTAKE_FIELD_IDS)) {
    const el = document.getElementById(id);
    if (el && data[key] !== undefined) el.value = data[key];
  }
  if (data.photo) {
    const preview = document.getElementById("intakePhotoPreview");
    preview.src = data.photo;
    preview.style.display = "";
  }
}

function initIntakeForm() {
  document.getElementById("intakeSaveBtn").addEventListener("click", async () => {
    const payload = {};
    for (const [key, id] of Object.entries(INTAKE_FIELD_IDS)) {
      const el = document.getElementById(id);
      if (el) payload[key] = el.value;
    }
    const fileInput = document.getElementById("intakePhotoInput");
    if (fileInput.files && fileInput.files[0]) {
      payload.photo = await fileToDataUrl(fileInput.files[0]);
    }
    const res = await fetch(apiUrl("/intake"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert("保存に失敗しました");
      return;
    }
    alert("保存しました");
  });
}

// ---- 音声ガイド付き事前問診 ----

function initVoiceIntake() {
  if (!isVoiceIntakeSupported()) return; // ボタンはHTML側でデフォルト非表示のまま

  const widget = initVoiceIntakeWidget({
    overlayId: "voiceIntakeOverlay",
    questionTextId: "voiceIntakeQuestion",
    progressId: "voiceIntakeProgress",
    statusId: "voiceIntakeStatus",
    transcriptId: "voiceIntakeTranscript",
    choicesId: "voiceIntakeChoices",
    cancelBtnId: "voiceIntakeCancelBtn",
    onFieldConfirmed: (fieldId, value) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = value;
    },
  });
  state.voiceIntakeWidget = widget;

  document.getElementById("voiceIntakeCard").style.display = "";
  document.getElementById("voiceIntakeStartBtn").addEventListener("click", () => widget.start());
}

// ---- 傾聴AIチャット ----

function initChat() {
  state.chatWidget = initChatWidget({
    inputId: "chatInput",
    sendBtnId: "chatSendBtn",
    messagesId: "chatMessages",
  });
}

// ---- 家の間取り 手書き共有 ----

let floorplanWidget = null;

async function refreshFloorplanList() {
  const res = await fetch(apiUrl("/floorplans"));
  if (!res.ok) return;
  const data = await res.json();
  const list = document.getElementById("floorplanList");
  if (!data.floorplans || data.floorplans.length === 0) {
    list.className = "note";
    list.textContent = "まだ共有されていません。";
    return;
  }
  list.className = "";
  list.innerHTML = "";
  for (const fp of data.floorplans) {
    const wrap = document.createElement("div");
    wrap.className = "floorplan-item";

    // image_data はHTMLとして解釈させず、DOM APIでプロパティとして設定する
    // （innerHTML中の属性値展開はXSSにつながるため使わない。サーバー側でも
    // data:image/...;base64,... 形式のみを許可するよう検証している）。
    const img = document.createElement("img");
    img.src = fp.image_data;
    img.alt = "間取り図";
    wrap.appendChild(img);

    if (fp.note) {
      const noteDiv = document.createElement("div");
      noteDiv.className = "note";
      noteDiv.style.marginTop = "4px";
      noteDiv.textContent = fp.note;
      wrap.appendChild(noteDiv);
    }

    const metaDiv = document.createElement("div");
    metaDiv.className = "meta";
    metaDiv.style.fontSize = "11px";
    metaDiv.style.color = "#9aa1a6";
    metaDiv.textContent = fp.created_at;
    wrap.appendChild(metaDiv);

    list.appendChild(wrap);
  }
}

function initFloorplanTab() {
  floorplanWidget = initFloorplanWidget({
    canvasId: "floorplanCanvas",
    undoBtnId: "floorplanUndoBtn",
    clearBtnId: "floorplanClearBtn",
  });

  document.getElementById("floorplanShareBtn").addEventListener("click", async () => {
    if (floorplanWidget.isEmpty()) {
      alert("まだ何も描かれていません");
      return;
    }
    const image_data = floorplanWidget.toDataUrl();
    const note = document.getElementById("floorplanNote").value;
    const res = await fetch(apiUrl("/floorplans"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data, note: note || undefined }),
    });
    if (!res.ok) {
      alert("共有に失敗しました");
      return;
    }
    floorplanWidget.clear();
    document.getElementById("floorplanNote").value = "";
    await refreshFloorplanList();
  });
}

// ---- 前兆現象共有 ----

function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    // getCurrentPositionのtimeoutオプションはブラウザ・環境によっては
    // 守られずコールバックが呼ばれないことがある（位置情報サービスが
    // 無効な環境などで確認済み）。前兆現象の共有全体がそれで止まって
    // しまわないよう、自前でも必ずタイムアウトさせる。
    setTimeout(() => finish({}), 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => finish({}),
      { timeout: 3000 }
    );
  });
}

const REPORTER_NAME_KEY = "kizashi_reporter_name";
const RECENT_REPORT_THRESHOLD_MS = 3 * 60 * 1000; // 3分以内の報告は「緊急」の強調表示にする

function formatReportedAt(reportedAt) {
  // D1/SQLiteの "YYYY-MM-DD HH:MM:SS"（UTC）形式をJSTの時刻表示に変換する
  const iso = reportedAt.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function reportedAtToDate(reportedAt) {
  return new Date(reportedAt.replace(" ", "T") + "Z");
}

// 危機感を伝えるUX（企画整理.md セクション4 項目6）。抽象的な一覧表示ではなく、
// 「〇〇さんの近くで報告がありました」という"誰かからの呼びかけ"の形で伝える。
function precursorCallout(p) {
  const who = p.reporter_name ? `${escapeHtml(p.reporter_name)}さん` : "現場の誰か";
  return `<b>⚠️ ${who}の近くで報告：</b>「${escapeHtml(p.sign_label)}」`;
}

async function refreshPrecursors() {
  const res = await fetch(apiUrl("/precursors"));
  if (!res.ok) return;
  const data = await res.json();
  const precursors = data.precursors || [];

  const feed = document.getElementById("feedList");
  if (precursors.length === 0) {
    feed.className = "note";
    feed.textContent = "まだ報告はありません。";
  } else {
    feed.className = "";
    feed.innerHTML = "";
    const now = Date.now();
    for (const p of precursors) {
      const isRecent = now - reportedAtToDate(p.reported_at).getTime() < RECENT_REPORT_THRESHOLD_MS;
      const div = document.createElement("div");
      div.className = "feed-item alert" + (isRecent ? " recent" : "");
      div.innerHTML = `<div>${precursorCallout(p)}</div><div class="meta">${formatReportedAt(p.reported_at)}</div>`;
      feed.appendChild(div);
    }
  }

  renderPrecursorMarkers(precursors);
}

function initPrecursorTab() {
  const nameInput = document.getElementById("precursorReporterName");
  const savedName = localStorage.getItem(REPORTER_NAME_KEY);
  if (savedName) nameInput.value = savedName;

  document.querySelectorAll(".precursor-item").forEach((item) => {
    item.addEventListener("click", () => item.classList.toggle("active"));
  });

  document.getElementById("reportBtn").addEventListener("click", async () => {
    const picked = [...document.querySelectorAll(".precursor-item.active")].map((i) => i.dataset.label);
    if (picked.length === 0) {
      alert("気づいた項目をタップしてから共有してください");
      return;
    }
    const reporterName = nameInput.value.trim();
    if (reporterName) localStorage.setItem(REPORTER_NAME_KEY, reporterName);
    const geo = await getGeolocation();
    await Promise.all(
      picked.map((label) =>
        fetch(apiUrl("/precursors"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sign_label: label, reporter_name: reporterName || undefined, ...geo }),
        })
      )
    );
    document.querySelectorAll(".precursor-item.active").forEach((i) => i.classList.remove("active"));
    await refreshPrecursors();
  });

  refreshPrecursors();
  state.precursorTimer = setInterval(refreshPrecursors, PRECURSOR_POLL_INTERVAL_MS);
}

// ---- メインアプリの初期化（ルーム参加後に一度だけ実行）----

function initMainApp() {
  initMap();
  initIntakeForm();
  initVoiceIntake();
  loadIntake();
  initFloorplanTab();
  refreshFloorplanList();
  initPrecursorTab();
  initChat();
}

// ---- 起動時：保存済みのルームコードがあれば自動的に再参加を試みる ----

initTabs();

(async () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const ok = await verifyRoom(stored);
    if (ok) {
      enterRoom(stored);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  }
  showEntryScreen();
})();
