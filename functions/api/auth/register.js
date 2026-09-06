import {
  cleanupExpired,
  createSession,
  json,
  makeLoginId,
  normalizeNickname,
  nowSeconds,
  readJson,
  requireSameOrigin,
  validateAndNormalizePublicJwk,
  validateDeviceId,
} from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    requireSameOrigin(request);
    const { nickname, deviceId, publicKeyJwk } = await readJson(request);
    const normalized = normalizeNickname(nickname);
    const safeDeviceId = validateDeviceId(deviceId);
    const safePublicJwk = await validateAndNormalizePublicJwk(publicKeyJwk);

    const loginId = await makeLoginId(env, normalized);
    const userId = crypto.randomUUID();
    const now = nowSeconds();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, login_id, created_at) VALUES (?1, ?2, ?3)"
      ).bind(userId, loginId, now),
      env.DB.prepare(
        "INSERT INTO devices (id, user_id, public_jwk, created_at, revoked_at) VALUES (?1, ?2, ?3, ?4, NULL)"
      ).bind(safeDeviceId, userId, JSON.stringify(safePublicJwk), now),
    ]);

    await cleanupExpired(env);
    const cookie = await createSession(env, request, userId);
    return json({ ok: true }, 201, { "Set-Cookie": cookie });
  } catch (error) {
    if (error?.message === "INVALID_NICKNAME") {
      return json({ ok: false, error: "Ник: 3–32 символа; буквы, цифры, _, . и -." }, 400);
    }
    if (["INVALID_DEVICE", "INVALID_PUBLIC_KEY", "BAD_ORIGIN", "BAD_CONTENT_TYPE", "BODY_TOO_LARGE"].includes(error?.message)) {
      return json({ ok: false, error: "Запрос отклонён." }, 400);
    }
    const message = String(error?.message || "");
    if (message.includes("UNIQUE")) {
      return json({ ok: false, error: "Не удалось создать аккаунт." }, 409);
    }

    // v1 stored password_* columns in users. v2 intentionally does not.
    // If a developer reused the old local D1 state, CREATE TABLE IF NOT EXISTS
    // cannot remove those old NOT NULL columns, so registration fails.
    if (message.includes("password_salt") || message.includes("password_hash") || message.includes("kdf")) {
      console.error("register_failed", "LEGACY_DB_SCHEMA", message);
      return json({
        ok: false,
        error: "Старая тестовая схема D1. Выполните: npm run db:reset:local"
      }, 503);
    }

    if (message.includes("Server secret is missing or too short")) {
      console.error("register_failed", "MISSING_LOGIN_HMAC_KEY");
      return json({
        ok: false,
        error: "Не настроен LOGIN_HMAC_KEY в .dev.vars."
      }, 503);
    }

    // Do not log request bodies or secrets, but keep the actual D1/WebCrypto
    // error message in local Wrangler logs so configuration bugs are diagnosable.
    console.error("register_failed", error?.name || "Error", message);
    return json({ ok: false, error: "Не удалось создать аккаунт." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
}
