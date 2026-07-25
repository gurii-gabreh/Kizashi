import { errorResponse } from "./lib/json.js";
import { handleCreateRoom, handleVerifyRoom, handleCloseRoom } from "./routes/incidents.js";
import { handleGetIntake, handlePostIntake } from "./routes/intake.js";
import { handleGetFloorplans, handlePostFloorplan } from "./routes/floorplans.js";
import { handleGetPrecursors, handlePostPrecursor } from "./routes/precursors.js";
import { purgeExpiredIncidents } from "./scheduled/purgeExpiredIncidents.js";

const ROOM_ROUTE = /^\/api\/rooms\/([^/]+)\/(verify|close|intake|floorplans|precursors)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    try {
      if (pathname === "/api/rooms" && method === "POST") {
        return await handleCreateRoom(request, env);
      }

      const match = pathname.match(ROOM_ROUTE);
      if (match) {
        const [, code, resource] = match;
        if (resource === "verify" && method === "GET") return await handleVerifyRoom(request, env, code);
        if (resource === "close" && method === "POST") return await handleCloseRoom(request, env, code);
        if (resource === "intake" && method === "GET") return await handleGetIntake(request, env, code);
        if (resource === "intake" && method === "POST") return await handlePostIntake(request, env, code);
        if (resource === "floorplans" && method === "GET")
          return await handleGetFloorplans(request, env, code);
        if (resource === "floorplans" && method === "POST")
          return await handlePostFloorplan(request, env, code);
        if (resource === "precursors" && method === "GET")
          return await handleGetPrecursors(request, env, code);
        if (resource === "precursors" && method === "POST")
          return await handlePostPrecursor(request, env, code);
        return errorResponse("Method not allowed", 405);
      }

      if (pathname.startsWith("/api/")) {
        return errorResponse("Not found", 404);
      }

      // API以外は静的アセット（フロントエンド）へフォールバック
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return errorResponse("Internal error", 500);
    }
  },

  async scheduled(event, env) {
    const result = await purgeExpiredIncidents(env.DB);
    console.log(`purgeExpiredIncidents: purged ${result.purged} incident(s)`);
  },
};
