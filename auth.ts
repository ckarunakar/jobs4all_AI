/**
 * Auth.js (NextAuth v5) configuration. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Providers: Google (OAuth) + Credentials (email/password, bcrypt). JWT session
 * strategy — no DB session table. Users are stored in
 * ITJC_SCRAPPER.dbo.temp_login_users (see lib/auth/users). `session.user.id` is
 * our SQL Server user ID. Secrets come from env (AUTH_SECRET, AUTH_GOOGLE_ID,
 * AUTH_GOOGLE_SECRET) and never reach the client.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  normalizeEmail,
  updateLastLogin,
  upsertGoogleUser,
} from "@/lib/auth/users";

/** Google is optional — a missing client id/secret must not crash the app. */
export const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Local dev + single-host demo — trust the request host (avoids UntrustedHost).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleConfigured ? [Google] : []),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normalizeEmail(String(credentials?.email ?? ""));
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user || !user.emailPasswordEnabled || !user.passwordHash) {
          return null;
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await updateLastLogin(user.id);
        return {
          id: String(user.id),
          email: user.email,
          name: user.name ?? undefined,
          image: user.imageUrl ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    // Upsert Google identities into our users table on sign-in.
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email = normalizeEmail(user.email ?? profile?.email ?? "");
        if (!email) return false;
        await upsertGoogleUser({
          email,
          name: user.name ?? (profile?.name as string | undefined) ?? null,
          imageUrl:
            user.image ?? (profile?.picture as string | undefined) ?? null,
          googleAccountId: account.providerAccountId,
        });
      }
      return true;
    },
    // Resolve our SQL Server user ID (by email) and stash it on the JWT.
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await getUserByEmail(user.email);
        if (dbUser) token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid != null) {
        session.user.id = String(token.uid);
      }
      return session;
    },
  },
});
