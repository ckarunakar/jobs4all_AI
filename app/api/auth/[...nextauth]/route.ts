/**
 * Auth.js catch-all route — mounts sign-in / callback / session endpoints.
 * Node runtime (the config uses mssql + bcrypt).
 */
import { handlers } from "@/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
