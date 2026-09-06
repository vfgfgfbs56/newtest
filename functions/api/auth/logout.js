import { json, requireSameOrigin, revokeCurrentSession } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const cookie = await revokeCurrentSession(context.env, context.request);
    return json({ ok: true }, 200, { "Set-Cookie": cookie });
  } catch {
    return json({ ok: false, error: "Запрос отклонён." }, 400);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
}
