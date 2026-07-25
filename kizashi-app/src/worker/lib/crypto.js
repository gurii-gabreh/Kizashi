// 事前問診フォーム（要配慮個人情報）用の暗号化・復号。
// AES-GCM（Web Crypto API、Workersランタイムの標準機能）。
// アプリ全体で1つの秘密鍵（サーバー側秘密鍵で一括暗号化する方式、企画整理.md
// セクション9で確定した設計）を使う。鍵はローカルでは .dev.vars の
// INTAKE_ENC_KEY、本番では `wrangler secret put INTAKE_ENC_KEY` で設定する。

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedKeyPromise = null;

function getKey(env) {
  if (!cachedKeyPromise) {
    if (!env.INTAKE_ENC_KEY) {
      throw new Error(
        "INTAKE_ENC_KEY が設定されていません。.dev.vars.example を参考に .dev.vars を作成してください。"
      );
    }
    const rawKey = base64ToBytes(env.INTAKE_ENC_KEY);
    cachedKeyPromise = crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  return cachedKeyPromise;
}

// plaintextObj（氏名・年齢・身体的特徴・服薬・任意の写真base64などをまとめた
// オブジェクト）をJSON化し、毎回新しいランダムIV（12バイト、使い回さない）で
// 暗号化する。D1のBLOB列にそのまま保存できる Uint8Array（iv || 暗号文）を返す。
export async function encryptIntake(env, plaintextObj) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(plaintextObj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
}

// D1から読み出したBLOB（ArrayBufferまたはUint8Array）を復号し、元のオブジェクトに戻す。
export async function decryptIntake(env, blob) {
  const key = await getKey(env);
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// 参考用に公開（このプロジェクトでは暗号化ペイロード以外での用途は今のところ無い）。
export { bytesToBase64, base64ToBytes };
