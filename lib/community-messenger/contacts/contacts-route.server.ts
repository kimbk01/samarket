import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { contactsErrorStatus } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  loadEnabledContactsSettings,
  type ContactsAdminSettings,
  type ContactsResult,
} from "@/lib/community-messenger/contacts/contacts-service.server";

/**
 * 연락처 API 공통 입구 — 로그인 → 횟수 제한 → 기능 켜짐(어드민 킬스위치) → 처리.
 * 응답은 항상 `private, no-store` (회원별 데이터 · edge 캐시 금지). 문구 없이 오류 코드만.
 */
export type ContactsRouteContext = { userId: string; sb: SupabaseClient; admin: ContactsAdminSettings };

const NO_STORE = { "Cache-Control": "private, no-store" };

export function contactsJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function contactsError(error: string, extra?: Record<string, unknown>): NextResponse {
  return contactsJson({ ok: false, error, ...(extra ?? {}) }, contactsErrorStatus(error));
}

export function contactsResultResponse<T>(r: ContactsResult<T>, toBody: (v: T) => Record<string, unknown>): NextResponse {
  if (!r.ok) return contactsError(r.error, r.extra);
  return contactsJson({ ok: true, ...toBody(r.value) });
}

export async function readContactsJsonBody(req: NextRequest): Promise<unknown | undefined> {
  try {
    const raw = await req.text();
    return raw.trim() ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return undefined;
  }
}

export async function withContactsRoute(
  req: NextRequest,
  rate: { name: string; limit: number },
  handler: (ctx: ContactsRouteContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const limited = await enforceRateLimit({
    key: `cm-contacts:${rate.name}:${getRateLimitKey(req, auth.userId)}`,
    limit: rate.limit,
    windowMs: 60_000,
    message: "rate_limited",
    code: "contacts_rate_limited",
  });
  if (!limited.ok) return limited.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return contactsError("supabase_unconfigured");
  const admin = await loadEnabledContactsSettings(sb);
  if (!admin) return contactsError("contacts_disabled");
  try {
    return await handler({ userId: auth.userId, sb, admin });
  } catch (e) {
    console.error(`[contacts] ${rate.name}`, e);
    return contactsError("internal_error");
  }
}
