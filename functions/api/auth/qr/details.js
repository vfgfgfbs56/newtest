import {
  cleanupExpired,
  json,
  readJson,
  requireSameOrigin,
  secretMatches,
} from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    requireSameOrigin(request);
    const { id, approvalSecret } = await readJson(request);
    if (typeof id !== "string" || id.length > 128) throw new Error("BAD_QR");

    await cleanupExpired(env);
    const row = await env.DB.prepare(
      "SELECT approval_secret_hash, challenge, status, expires_at FROM qr_sessions WHERE id = ?1 LIMIT 1"
    ).bind(id).first();

    if (!row || !(await secretMatches(row.approval_secret_hash, approvalSecret))) {
      return json({ ok: false, error: "QR недействителен." }, 404);
    }
    if (row.status !== "pending") {
      return json({ ok: false, error: "QR уже использован или истёк." }, 409);
    }

    return json({ ok: true, challenge: row.challenge, expiresAt: row.expires_at });
  } catch (error) {
    if (["BAD_QR", "BAD_ORIGIN", "BAD_CONTENT_TYPE", "BODY_TOO_LARGE"].includes(error?.message)) {
      return json({ ok: false, error: "Запрос отклонён." }, 400);
    }
    console.error("qr_details_failed", error?.name || "Error");
    return json({ ok: false, error: "Не удалось проверить QR." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
}
