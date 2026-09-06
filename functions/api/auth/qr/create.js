import { cleanupExpired, json, nowSeconds, qrExpiresAt, randomToken, requireSameOrigin, sha256Text } from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    requireSameOrigin(request);
    await cleanupExpired(env);
    const id = randomToken(18);
    const approvalSecret = randomToken(32);
    const claimSecret = randomToken(32);
    const challenge = randomToken(32);
    const now = nowSeconds();
    const expiresAt = qrExpiresAt();
    await env.DB.prepare(
      `INSERT INTO qr_sessions
       (id, approval_secret_hash, claim_secret_hash, challenge, status, user_id, approved_device_id, created_at, expires_at, claimed_at)
       VALUES (?1, ?2, ?3, ?4, 'pending', NULL, NULL, ?5, ?6, NULL)`
    ).bind(id, await sha256Text(approvalSecret), await sha256Text(claimSecret), challenge, now, expiresAt).run();

    const approvalUrl = new URL("/", request.url);
    approvalUrl.searchParams.set("approve", id);
    approvalUrl.hash = new URLSearchParams({ s: approvalSecret }).toString();
    return json({ ok: true, id, claimSecret, expiresAt, approvalUrl: approvalUrl.toString() }, 201);
  } catch (error) {
    if (error?.message === "BAD_ORIGIN") return json({ ok: false, error: "Запрос отклонён." }, 400);
    console.error("qr_create_failed", error?.name || "Error", String(error?.message || ""));
    return json({ ok: false, error: "Не удалось создать QR." }, 500);
  }
}
export function onRequest() { return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" }); }
