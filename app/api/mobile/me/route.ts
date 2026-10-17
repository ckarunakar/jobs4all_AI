/**
 * GET /api/mobile/me — who the caller is. The app calls this at launch to
 * decide between its signed-in screens and the login screen.
 * Returns { ok, user: { id, email, name } }, or 401 when the token (or
 * cookie) doesn't resolve to an existing user.
 */

import { getUserById } from "@/lib/auth/users";
import { getRequestUser } from "@/lib/auth/requestUser";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const who = await getRequestUser(req);
    if (!who) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    const user = await getUserById(who.id);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    return noStoreJson({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/mobile/me] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not load your account. Please try again." },
      500,
    );
  }
}
