/**
 * JSON response marked `Cache-Control: no-store` — used by every route that
 * returns a token or account data (mobile + account routes), so no proxy or
 * client cache ever keeps a copy.
 */

import { NextResponse } from "next/server";

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
