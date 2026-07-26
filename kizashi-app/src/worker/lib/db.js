export function generateId() {
  return crypto.randomUUID();
}

// 6桁の数字コード（現場ルームの参加コード＝唯一のアクセス制御）。先頭0埋めを含む。
// これはセキュリティトークンとして機能するため、Math.random()（暗号論的に
// 安全でない）ではなく、暗号化にも使っているcrypto.getRandomValues()で
// 生成する。
export function generateRoomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

// SQLiteのdatetime('now')と同じ "YYYY-MM-DD HH:MM:SS" (UTC) 形式に揃える。
// これにより closed_at/expires_at と created_at を単純な文字列比較で
// 正しく前後比較できる（ISO8601のTやZが混ざると比較がずれるため統一する）。
export function toSqliteDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
