/**
 * POST /api/account/delete — permanently delete the caller's account and all
 * of its data (an app-store requirement). Works with the website cookie or
 * the app's Bearer token. Body: { password?, confirmEmail? }
 *
 * Password accounts must re-enter the password; password-less (Google-only)
 * accounts type their email. A failed confirmation is 403, not 401: the
 * caller IS signed in, and the app treats 401 as "logged out".
 */

import bcrypt from "bcryptjs";
import { getUserById, normalizeEmail } from "@/lib/auth/users";
import { getRequestUser } from "@/lib/auth/requestUser";
import { deleteAccount } from "@/lib/auth/deleteAccount";
import { noStoreJson } from "@/lib/auth/noStoreJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const who = await getRequestUser(req);
    if (!who) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }

    // A cross-site form can't send application/json without a CORS preflight.
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    let body: { password?: unknown; confirmEmail?: unknown };
    try {
      body = await req.json();
    } catch {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }
    if (!body || typeof body !== "object") {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const user = await getUserById(who.id);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }

    if (user.emailPasswordEnabled && user.passwordHash) {
      const password = typeof body.password === "string" ? body.password : "";
      const valid =
        password !== "" && (await bcrypt.compare(password, user.passwordHash));
      if (!valid) {
        return noStoreJson({ ok: false, error: "Incorrect password." }, 403);
      }
    } else {
      const confirm =
        typeof body.confirmEmail === "string"
          ? normalizeEmail(body.confirmEmail)
          : "";
      if (!confirm || confirm !== normalizeEmail(user.email)) {
        return noStoreJson({ ok: false, error: "Email does not match." }, 403);
      }
    }

    await deleteAccount(user.id, user.email);
    console.log(`[api/account/delete] deleted user ${user.id}`);
    return noStoreJson({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/account/delete] ${message}`);
    return noStoreJson(
      { ok: false, error: "Could not delete the account. Please try again." },
      500,
    );
  }
}
