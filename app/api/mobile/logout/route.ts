/**
 * POST /api/mobile/logout — end the calling app session.
 * Requires `Authorization: Bearer <token>` (401 without one). Idempotent:
 * an already-revoked or expired token still gets { ok: true }, because the
 * client's only job after logout is to forget the token.
 */

import { getBearerToken } from "@/lib/auth/requestUser";
import { revokeMobileSession } from "@/lib/auth/mobileSessions";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
  }

  try {
    await revokeMobileSession(token);
    return noStoreJson({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/logout] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not log out. Please try again." },
      500,
    );
  }
}
