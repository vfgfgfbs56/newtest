import {
  cleanupExpired,
  createSession,
  json,
  nowSeconds,
  readJson,
  requireSameOrigin,
  secretMatches,
} from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    requireSameOrigin(request);
    const { id, claimSecret } = await readJson(request);
    if (typeof id !== "string" || id.length > 128) throw new Error("BAD_QR");

    await cleanupExpired(env);
    const row = await env.DB.prepare(
      "SELECT claim_secret_hash, status, user_id FROM qr_sessions WHERE id = ?1 LIMIT 1"
    ).bind(id).first();

    if (!row || !(await secretMatches(row.claim_secret_hash, claimSecret))) {
      return json({ ok: false, error: "QR недействителен." }, 404);
    }

    if (row.status === "pending") return json({ ok: true, status: "pending" }, 202);
    if (row.status === "expired" || row.status === "denied") {
      return json({ ok: false, status: row.status, error: "QR больше недействителен." }, 410);
    }
    if (row.status === "claimed") {
      return json({ ok: false, status: "claimed", error: "QR уже использован." }, 409);
    }
    if (row.status !== "approved" || !row.user_id) {
      return json({ ok: false, error: "Некорректное состояние QR." }, 409);
    }

    const lock = await env.DB.prepare(
      "UPDATE qr_sessions SET status = 'claimed', claimed_at = ?1 WHERE id = ?2 AND status = 'approved'"
    ).bind(nowSeconds(), id).run();

    if (!lock.meta?.changes) return json({ ok: false, error: "QR уже использован." }, 409);

    try {
      const cookie = await createSession(env, request, row.user_id);
      return json({ ok: true, status: "approved" }, 200, { "Set-Cookie": cookie });
    } catch (error) {
      await env.DB.prepare(
        "UPDATE qr_sessions SET status = 'approved', claimed_at = NULL WHERE id = ?1 AND status = 'claimed'"
      ).bind(id).run();
      throw error;
    }
  } catch (error) {
    if (["BAD_QR", "BAD_ORIGIN", "BAD_CONTENT_TYPE", "BODY_TOO_LARGE"].includes(error?.message)) {
      return json({ ok: false, error: "Запрос отклонён." }, 400);
    }
    console.error("qr_status_failed", error?.name || "Error");
    return json({ ok: false, error: "Не удалось проверить QR." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
}
