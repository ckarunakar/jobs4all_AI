import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Add our SQL Server user id to the session. */
  interface Session {
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /** Our login_users.ID carried on the JWT. */
  interface JWT {
    uid?: number;
  }
}
