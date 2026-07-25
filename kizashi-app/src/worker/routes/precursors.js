import { jsonResponse, errorResponse } from "../lib/json.js";
import { resolveRoom } from "../lib/roomAuth.js";
import { generateId } from "../lib/db.js";
import { PRECURSOR_LABELS } from "../lib/precursorLabels.js";

export async function handlePostPrecursor(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  if (!PRECURSOR_LABELS.includes(body.sign_label)) {
    return errorResponse("sign_labelが公式チェックリストにありません", 400);
  }

  const id = generateId();
  const latitude = typeof body.latitude === "number" ? body.latitude : null;
  const longitude = typeof body.longitude === "number" ? body.longitude : null;
  // 危機感を伝えるUX（「〇〇さんの近くで報告がありました」）用。任意・匿名可。
  const reporterName =
    typeof body.reporter_name === "string" && body.reporter_name.trim()
      ? body.reporter_name.trim().slice(0, 40)
      : null;

  await env.DB.prepare(
    "INSERT INTO precursor_signs (id, incident_id, sign_label, latitude, longitude, reporter_name) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, room.id, body.sign_label, latitude, longitude, reporterName)
    .run();

  const row = await env.DB.prepare("SELECT reported_at FROM precursor_signs WHERE id = ?")
    .bind(id)
    .first();

  return jsonResponse({ id, reported_at: row.reported_at }, 201);
}

export async function handleGetPrecursors(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  const url = new URL(request.url);
  const since = url.searchParams.get("since");

  let query =
    "SELECT id, sign_label, latitude, longitude, reported_at, reporter_name FROM precursor_signs WHERE incident_id = ?";
  const binds = [room.id];
  if (since) {
    query += " AND reported_at > ?";
    binds.push(since);
  }
  query += " ORDER BY reported_at DESC";

  const { results } = await env.DB.prepare(query)
    .bind(...binds)
    .all();
  return jsonResponse({ precursors: results });
}
