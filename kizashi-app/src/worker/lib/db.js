export function generateId() {
  return crypto.randomUUID();
}

// 6桁の数字コード（現場ルームの参加コード）。先頭0埋めを含む。
export function generateRoomCode() {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

// SQLiteのdatetime('now')と同じ "YYYY-MM-DD HH:MM:SS" (UTC) 形式に揃える。
// これにより closed_at/expires_at と created_at を単純な文字列比較で
// 正しく前後比較できる（ISO8601のTやZが混ざると比較がずれるため統一する）。
export function toSqliteDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
