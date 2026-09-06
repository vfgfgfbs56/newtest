import { getSession, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const session = await getSession(context.env, context.request);
  if (!session) return json({ authenticated: false }, 401);
  return json({ authenticated: true });
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
}
