// 事案終了から30日経過したincidentsを、関連データごとカスケード削除する。
// D1にはFK ON DELETE CASCADEの自動適用がないため、明示的にbatch()で
// トランザクション的に削除する（企画整理.md セクション9「事案終了後の自動削除」）。
export async function purgeExpiredIncidents(db) {
  const { results } = await db
    .prepare("SELECT id FROM incidents WHERE expires_at IS NOT NULL AND expires_at < datetime('now')")
    .all();

  for (const { id } of results) {
    await db.batch([
      db.prepare("DELETE FROM family_intake WHERE incident_id = ?").bind(id),
      db.prepare("DELETE FROM floor_plans WHERE incident_id = ?").bind(id),
      db.prepare("DELETE FROM precursor_signs WHERE incident_id = ?").bind(id),
      db.prepare("DELETE FROM incidents WHERE id = ?").bind(id),
    ]);
  }

  return { purged: results.length };
}
