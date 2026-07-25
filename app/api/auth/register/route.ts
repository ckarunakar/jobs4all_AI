/**
 * POST /api/auth/register — create an email/password account.
 * Body: { name?, email, password }
 *
 * Hashes with bcrypt (never stores/logs plaintext). If the email already has a
 * password account, rejects; if it exists Google-only, adds a password to that
 * same account. Never returns the password hash.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createEmailPasswordUser,
  enableEmailPassword,
  getUserByEmail,
  normalizeEmail,
} from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.");
  }

  const name = String(body.name ?? "").trim() || null;
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  if (!email || !EMAIL_RE.test(email)) return fail("Enter a valid email.");
  if (password.length < 8) {
    return fail("Password must be at least 8 characters.");
  }

  try {
    const existing = await getUserByEmail(email);
    if (existing?.emailPasswordEnabled) {
      return fail(
        "An account with this email already exists. Try logging in.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = existing
      ? await enableEmailPassword({ userId: existing.id, passwordHash, name })
      : await createEmailPasswordUser({ email, passwordHash, name });

    // Never expose the hash.
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    // Log the error message only — never the password.
    const message = err instanceof Error ? err.message : "Registration failed";
    console.error(`[auth/register] ${message}`);
    return fail("Could not create the account. Please try again.", 500);
  }
}
