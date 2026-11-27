import { NextResponse } from "next/server";
import {
  getOptionalAuthenticatedUserId,
  getOptionalAuthenticatedUserIdStrict,
} from "@/lib/auth/get-optional-authenticated-user-id";
import { jsonError } from "@/lib/http/api-route";

/** @deprecated 기본 `requireAuthenticatedUserId` 와 동일. 레거시 import 호환용. */
export async function requireAuthenticatedUserIdPreferSession(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  return requireAuthenticatedUserId();
}

export async function requireAuthenticatedUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      response: jsonError("unauthorized", 401, { authenticated: false, code: "unauthorized" }),
    };
  }
  return { ok: true, userId };
}

export async function requireAuthenticatedUserIdStrict(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await getOptionalAuthenticatedUserIdStrict();
  if (!userId) {
    return {
      ok: false,
      response: jsonError("unauthorized", 401, { authenticated: false, code: "unauthorized" }),
    };
  }
  return { ok: true, userId };
}
