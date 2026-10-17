/**
 * Who is calling? One helper for every session-gated API route.
 * SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * A request whose Authorization scheme is Bearer (the native app) is judged
 * on that token alone: empty, invalid or expired → null, never a fallback to
 * the cookie (so a bad token is a clear 401, not a silent identity switch).
 * Without a Bearer header, the Auth.js session cookie (the website) is used.
 * DB errors propagate: a failure to check must never read as "signed out".
 */

import "server-only";
import { auth } from "@/auth";
import {
  resolveMobileToken,
  type MobileUser,
} from "@/lib/auth/mobileSessions";

export type RequestUser = MobileUser;

const BEARER_RE = /^bearer(?:\s+(.*))?$/i;

/** The Bearer token; "" for a Bearer header with no token; null when absent. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = BEARER_RE.exec(header.trim());
  if (!m) return null;
  return (m[1] ?? "").trim();
}

/** True when the request presents a Bearer credential (even an empty one). */
export function hasBearer(req: Request): boolean {
  return getBearerToken(req) !== null;
}

/** The signed-in user (id + current email), or null. */
export async function getRequestUser(
  req: Request,
): Promise<RequestUser | null> {
  const token = getBearerToken(req);
  if (token !== null) {
    return token ? resolveMobileToken(token) : null;
  }

  const session = await auth();
  const id = session?.user?.id ? Number(session.user.id) : NaN;
  const email = session?.user?.email?.trim();
  if (!Number.isInteger(id) || id <= 0 || !email) return null;
  return { id, email };
}
