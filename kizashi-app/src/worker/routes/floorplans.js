import { jsonResponse, errorResponse } from "../lib/json.js";
import { resolveRoom } from "../lib/roomAuth.js";
import { generateId } from "../lib/db.js";

// 家の間取り 手書き共有（企画整理.md セクション4 項目4、主機能）。
// 要配慮個人情報ではないため暗号化は行わない。

// PNG/JPEG/WebPのbase64データURIのみを許可する厳密な形式チェック。
// フロントエンド（app.js）はこの値を <img src="..."> として描画するため、
// "や<のような文字を含む値を許すとHTML属性からの脱出（XSS）につながる。
// startsWith("data:image/")だけの緩い検証は不十分（本文が任意の文字列でも
// 通ってしまう）だったため、base64本体まで含めて厳密な正規表現で検証する。
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/;

export async function handlePostFloorplan(request, env, code) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  if (typeof body.image_data !== "string" || !IMAGE_DATA_URL_PATTERN.test(body.image_data)) {
    return errorResponse(
      "image_dataが不正です（PNG/JPEG/WebPのbase64データURI形式で送ってください）",
      400
    );
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

// 共有済みの間取りを修正する（描き間違いの訂正のため。新規投稿とは別に、
// 既存の1件を上書きする）。他ルームのidを指定しても更新されないよう、
// incident_idも条件に含めて絞り込む。
export async function handleUpdateFloorplan(request, env, code, id) {
  const room = await resolveRoom(env.DB, code);
  if (!room) return errorResponse("ルームが見つかりません", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("不正なリクエストです", 400);
  }

  if (typeof body.image_data !== "string" || !IMAGE_DATA_URL_PATTERN.test(body.image_data)) {
    return errorResponse(
      "image_dataが不正です（PNG/JPEG/WebPのbase64データURI形式で送ってください）",
      400
    );
  }

  const result = await env.DB.prepare(
    "UPDATE floor_plans SET image_data = ?, note = ? WHERE id = ? AND incident_id = ?"
  )
    .bind(body.image_data, body.note ?? null, id, room.id)
    .run();

  if (result.meta.changes === 0) return errorResponse("間取りが見つかりません", 404);
  return jsonResponse({ id });
}
