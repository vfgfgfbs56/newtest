import {
  cleanupExpired,
  getSession,
  json,
  qrSignPayload,
  readJson,
  requireSameOrigin,
  secretMatches,
  validateDeviceId,
  verifyDeviceSignature,
} from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    requireSameOrigin(request);
    const session = await getSession(env, request);
    if (!session) return json({ ok: false, error: "Сначала войдите в аккаунт." }, 401);

    const { id, approvalSecret, deviceId, signature } = await readJson(request);
    const safeDeviceId = validateDeviceId(deviceId);
    if (typeof id !== "string" || id.length > 128) throw new Error("BAD_QR");

    await cleanupExpired(env);
    const qr = await env.DB.prepare(
      "SELECT approval_secret_hash, challenge, status FROM qr_sessions WHERE id = ?1 LIMIT 1"
    ).bind(id).first();

    if (!qr || !(await secretMatches(qr.approval_secret_hash, approvalSecret))) {
      return json({ ok: false, error: "QR недействителен." }, 404);
    }
    if (qr.status !== "pending") {
      return json({ ok: false, error: "QR уже использован или истёк." }, 409);
    }

    const device = await env.DB.prepare(
      "SELECT public_jwk FROM devices WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL LIMIT 1"
    ).bind(safeDeviceId, session.userId).first();

    if (!device) return json({ ok: false, error: "Это устройство не является доверенным." }, 403);

    const publicJwk = JSON.parse(device.public_jwk);
    const valid = await verifyDeviceSignature(publicJwk, qrSignPayload(id, qr.challenge), signature);
    if (!valid) return json({ ok: false, error: "Криптографическое подтверждение отклонено." }, 403);

    const result = await env.DB.prepare(
      `UPDATE qr_sessions
       SET status = 'approved', user_id = ?1, approved_device_id = ?2
       WHERE id = ?3 AND status = 'pending'`
    ).bind(session.userId, safeDeviceId, id).run();

    if (!result.meta?.changes) return json({ ok: false, error: "QR уже использован." }, 409);
    return json({ ok: true, approved: true });
  } catch (error) {
    if (["INVALID_DEVICE", "BAD_QR", "BAD_ORIGIN", "BAD_CONTENT_TYPE", "BODY_TOO_LARGE"].includes(error?.message)) {
      return json({ ok: false, error: "Запрос отклонён." }, 400);
    }
    console.error("qr_approve_failed", error?.name || "Error");
    return json({ ok: false, error: "Не удалось подтвердить вход." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
}
