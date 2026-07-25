// 現場ルームコードによるアクセス制御。すべてのAPIルートはこれを経由して
// incident行を解決する（クライアント側の制御に頼らず、毎リクエスト・
// サーバー側で検証する）。存在しないコードと期限切れのコードを区別せず
// どちらもnullを返す＝どちらもクライアントには404として見える（総当たり
// 探索でコードの有効性を推測できないようにするため）。
export async function resolveRoom(db, code) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return null;
  }
  const row = await db
    .prepare(
      "SELECT * FROM incidents WHERE room_code = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
    )
    .bind(code)
    .first();
  return row ?? null;
}
