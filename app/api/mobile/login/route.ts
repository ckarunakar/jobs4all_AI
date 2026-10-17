/**
 * POST /api/mobile/login — email/password login for the native app.
 * Body: { email, password, deviceName? }
 * Returns: { ok, token, expiresAt (ISO 8601), user: { id, email, name } }
 *
 * The token is returned once; the server keeps only its hash
 * (lib/auth/mobileSessions). Unknown email and wrong password get the same
 * 401 message. Never logs the password or the token.
 */

import { verifyCredentials } from "@/lib/auth/credentials";
import {
  createMobileSession,
  deleteExpiredSessions,
} from "@/lib/auth/mobileSessions";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DEVICE_NAME = 100;

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; deviceName?: unknown };
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object") {
    return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return noStoreJson(
      { ok: false, error: "Email and password are required." },
      400,
    );
  }
  const deviceName =
    typeof body.deviceName === "string"
      ? body.deviceName.trim().slice(0, MAX_DEVICE_NAME) || null
      : null;

  try {
    const user = await verifyCredentials(email, password);
    if (!user) {
      return noStoreJson(
        { ok: false, error: "Invalid email or password." },
        401,
      );
    }
    await deleteExpiredSessions(user.id);
    const { token, expiresAt } = await createMobileSession(user.id, deviceName);
    return noStoreJson({
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/login] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not log in. Please try again." },
      500,
    );
  }
}
