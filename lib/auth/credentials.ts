/**
 * Email/password check shared by the website (Auth.js Credentials provider)
 * and the native app (POST /api/mobile/login). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * One place decides whether a password is right, so the two logins can never
 * drift apart. Never logs or returns the password or its hash beyond the
 * LoginUser row the caller already gets from lib/auth/users.
 */

import "server-only";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  normalizeEmail,
  updateLastLogin,
  type LoginUser,
} from "@/lib/auth/users";

/**
 * The user when `emailInput` has a password account and `password` matches
 * (LastLoginAt is recorded); null otherwise. Throws only on DB errors.
 */
export async function verifyCredentials(
  emailInput: string,
  password: string,
): Promise<LoginUser | null> {
  const email = normalizeEmail(emailInput);
  if (!email || !password) return null;

  const user = await getUserByEmail(email);
  if (!user || !user.emailPasswordEnabled || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  await updateLastLogin(user.id);
  return user;
}
