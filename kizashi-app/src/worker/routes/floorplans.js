import { jsonResponse, errorResponse } from "../lib/json.js";
import { resolveRoom } from "../lib/roomAuth.js";
import { generateId } from "../lib/db.js";

// 家の間取り 手書き共有（企画整理.md セクション4 項目4、主機能）。
// 要配慮個人情報ではないため暗号化は行わない。

export async function handlePostFloorplan(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  if (typeof body.image_data !== "string" || !body.image_data.startsWith("data:image/")) {
    return errorResponse("image_dataが不正です（data:image/... 形式で送ってください）", 400);
  }

  const id = generateId();
  await env.DB.prepare(
    "INSERT INTO floor_plans (id, incident_id, image_data, note) VALUES (?, ?, ?, ?)"
  )
    .bind(id, room.id, body.image_data, body.note ?? null)
    .run();
  return jsonResponse({ id }, 201);
}

export async function handleGetFloorplans(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  const { results } = await env.DB.prepare(
    "SELECT id, image_data, note, created_at FROM floor_plans WHERE incident_id = ? ORDER BY created_at DESC"
  )
    .bind(room.id)
    .all();
  return jsonResponse({ floorplans: results });
}
