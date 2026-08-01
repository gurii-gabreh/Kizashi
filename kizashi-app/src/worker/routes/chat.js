import { jsonResponse, errorResponse } from "../lib/json.js";
import { resolveRoom } from "../lib/roomAuth.js";
import { detectCrisis } from "../lib/crisisDetection.js";
import { CRISIS_MESSAGE, CRISIS_HOTLINES } from "../lib/crisisResponse.js";

// TODO: Cloudflareダッシュボード／公式ドキュメントで現行のWorkers AIカタログの
// モデルIDを確認してから確定させること。開発セッションからdevelopers.cloudflare.com
// にアクセスできず未検証（暫定候補）。
const AI_MODEL_ID = "@cf/meta/llama-3.1-8b-instruct";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 8; // クライアントから毎回渡される直近往復数の上限。サーバーには保存しない。

// 傾聴に役割を厳格に限定するシステムプロンプト。企画整理.md セクション5の
// 「助かる見込み時間・生存確率の提示はしない」という絶対除外事項に直結する
// 制約を明示的に含める（「うちの母は助かりますか」のような質問が実際に来る
// ことを想定しているため）。
const SYSTEM_PROMPT = `あなたは、土砂災害の現場で行方不明になった家族の帰りを待つ人に寄り添う、
「話を聴くだけ」の存在です。以下を必ず守ってください。

1. 相手の気持ちを否定せず、まず気持ちをそのまま受け止め、共感を言葉にしてください。
2. 助言・指示・行動計画は一切提案しないでください。
3. 生存の可能性、生存確率、見つかる見込み時間について、いかなる推測・予測・
   数値も口にしないでください。「きっと大丈夫です」のような根拠のない断定も
   避け、「今はまだ分からない、不安な時間ですね」のように気持ちに寄り添う
   表現にとどめてください。
4. 自分は専門のカウンセラーや救助隊員ではないことを、聞かれれば正直に伝えてください。
5. 深刻な精神的危機の兆候を感じ取った場合は、自分だけで抱え込まず、
   専門の相談窓口に連絡するよう温かく伝えてください。
6. 短く、静かな口調で。長い説明や箇条書きはしないでください。
7. 捜索の具体的な指示や個人情報を尋ねられても、それはこのアプリの別機能の
   役割であることを伝え、自分は「話を聴く」ことに徹してください。`;

const STUB_REPLY =
  "［開発用スタブ応答］実際のAI応答はデプロイ後、Cloudflareアカウントに接続して確認してください。" +
  "このメッセージはenv.AIが利用できない環境（ローカル検証など）で返されています。";

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
}

export async function handlePostChat(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    return errorResponse("messageが必要です", 400);
  }
  const message = body.message.slice(0, MAX_MESSAGE_LENGTH);

  // 1) 決定的キーワード安全網。env.AI呼び出しより必ず先に実行する
  //    （プロンプト操作やモデルの気まぐれに左右されない）。
  if (detectCrisis(message)) {
    return jsonResponse({
      reply: CRISIS_MESSAGE,
      crisis: true,
      hotlines: CRISIS_HOTLINES,
      source: "safety-net",
    });
  }

  const history = sanitizeHistory(body.history);

  // 2) Workers AIバインディングが無い環境（ローカル検証等）はスタブ応答。
  //    UI配線・安全網の検証をCloudflareアカウント無しでも可能にするため。
  if (!env.AI) {
    return jsonResponse({ reply: STUB_REPLY, crisis: false, source: "stub" });
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ];
    const result = await env.AI.run(AI_MODEL_ID, { messages });
    const reply = typeof result?.response === "string" ? result.response : STUB_REPLY;
    return jsonResponse({ reply, crisis: false, source: "ai" });
  } catch (err) {
    console.error("chat AI error", err);
    return jsonResponse({ reply: STUB_REPLY, crisis: false, source: "stub-error" });
  }
}
