import { jsonResponse, errorResponse } from "../lib/json.js";
import { resolveRoom } from "../lib/roomAuth.js";
import { generateId } from "../lib/db.js";
import { encryptIntake, decryptIntake } from "../lib/crypto.js";

// 警察の「行方不明者届」で標準的に聴取される内容に準拠（企画整理.md セクション4）。
// 独自の追加項目は設けない。
const INTAKE_FIELDS = [
  "name",
  "age",
  "gender",
  "lastSeen",
  "heightBuild",
  "hair",
  "glasses",
  "clothing",
  "medicationAllergy",
  "mobility",
  "photo", // 任意。data:image/...;base64,... 形式。暗号化ペイロードにまとめて含める
];

function pickIntakeFields(body) {
  const out = {};
  for (const key of INTAKE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export async function handlePostIntake(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  const payload = pickIntakeFields(body);
  const encrypted = await encryptIntake(env, payload);

  // 1インシデントにつき1件として扱う（家族が事前入力する単一フォームという想定。
  // 詳細は tools/d1-poc/README.md および実装計画を参照）。
  const existing = await env.DB.prepare("SELECT id FROM family_intake WHERE incident_id = ?")
    .bind(room.id)
    .first();

  if (existing) {
    await env.DB.prepare("UPDATE family_intake SET encrypted_payload = ? WHERE id = ?")
      .bind(encrypted, existing.id)
      .run();
    return jsonResponse({ id: existing.id });
  }

  const id = generateId();
  await env.DB.prepare(
    "INSERT INTO family_intake (id, incident_id, encrypted_payload) VALUES (?, ?, ?)"
  )
    .bind(id, room.id, encrypted)
    .run();
  return jsonResponse({ id }, 201);
}

export async function handleGetIntake(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  const row = await env.DB.prepare(
    "SELECT id, encrypted_payload, created_at FROM family_intake WHERE incident_id = ?"
  )
    .bind(room.id)
    .first();
  if (!row) return jsonResponse(null, 404);

  const payload = await decryptIntake(env, row.encrypted_payload);
  return jsonResponse({ id: row.id, created_at: row.created_at, ...payload });
}
