import { jsonResponse, errorResponse } from "../lib/json.js";
import { generateId, generateRoomCode, toSqliteDatetime } from "../lib/db.js";
import { resolveRoom } from "../lib/roomAuth.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function handleCreateRoom(request, env) {
  const db = env.DB;

  let roomCode = null;
  for (let attempts = 0; attempts < 10; attempts++) {
    const candidate = generateRoomCode();
    const existing = await db
      .prepare("SELECT 1 FROM incidents WHERE room_code = ?")
      .bind(candidate)
      .first();
    if (!existing) {
      roomCode = candidate;
      break;
    }
  }
  if (!roomCode) {
    return errorResponse("ルームコードの発行に失敗しました。もう一度お試しください。", 500);
  }

  const id = generateId();
  await db.prepare("INSERT INTO incidents (id, room_code) VALUES (?, ?)").bind(id, roomCode).run();
  return jsonResponse({ incident_id: id, room_code: roomCode }, 201);
}

export async function handleVerifyRoom(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return jsonResponse({ valid: false }, 404);
  return jsonResponse({
    valid: true,
    created_at: room.created_at,
    closed_at: room.closed_at,
  });
}

export async function handleCloseRoom(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  if (room.closed_at) {
    return jsonResponse({ closed_at: room.closed_at, expires_at: room.expires_at });
  }

  const now = new Date();
  const closedAt = toSqliteDatetime(now);
  const expiresAt = toSqliteDatetime(new Date(now.getTime() + THIRTY_DAYS_MS));

  await env.DB.prepare("UPDATE incidents SET closed_at = ?, expires_at = ? WHERE id = ?")
    .bind(closedAt, expiresAt, room.id)
    .run();

  return jsonResponse({ closed_at: closedAt, expires_at: expiresAt });
}
