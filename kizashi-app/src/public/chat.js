// 傾聴AIチャット（企画整理.md セクション5の絶対除外事項を厳守：助言・予測は
// せず、傾聴と励ましに限定する）。floorplan.jsと同じ自己完結型ウィジェット
// パターン。
//
// 会話内容はこのウィジェットのクロージャ内メモリにのみ保持し、localStorage
// にもD1にも一切保存しない（機微な内容のため、意図的に永続化しない設計）。
// apiUrl()はapp.jsで定義される関数（呼び出し時点で解決されればよいため、
// スクリプトの読み込み順には依存しない）。

function initChatWidget({ inputId, sendBtnId, messagesId }) {
  const input = document.getElementById(inputId);
  const sendBtn = document.getElementById(sendBtnId);
  const messagesEl = document.getElementById(messagesId);

  let history = [];
  let sending = false;

  function appendBubble(role, text) {
    const div = document.createElement("div");
    div.className = "chat-bubble " + (role === "user" ? "chat-bubble-user" : "chat-bubble-ai");
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendCrisis(reply, hotlines) {
    const div = document.createElement("div");
    div.className = "feed-item alert";
    const p = document.createElement("div");
    p.textContent = reply;
    div.appendChild(p);
    (hotlines || []).forEach((h) => {
      const a = document.createElement("a");
      a.href = "tel:" + String(h.phone).replace(/-/g, "");
      a.textContent = `${h.name}：${h.phone}`;
      a.style.display = "block";
      a.style.marginTop = "6px";
      a.style.fontWeight = "700";
      a.style.color = "inherit";
      div.appendChild(a);
    });
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = "";
    appendBubble("user", text);
    history.push({ role: "user", content: text });

    try {
      const res = await fetch(apiUrl("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendBubble("ai", "エラーが発生しました。しばらくしてからもう一度お試しください。");
        return;
      }
      if (data.crisis) {
        appendCrisis(data.reply, data.hotlines);
      } else {
        appendBubble("ai", data.reply);
      }
      history.push({ role: "assistant", content: data.reply });
    } catch {
      appendBubble("ai", "エラーが発生しました。しばらくしてからもう一度お試しください。");
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  return {
    reset: () => {
      history = [];
      messagesEl.innerHTML = "";
    },
  };
}
