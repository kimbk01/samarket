import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { findIdentitiesByUserId } from "@/lib/auth/provider-identity/repository.server";
import { LINKABLE_AUTH_PROVIDERS } from "@/lib/auth/provider-identity/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, errorCode: "supabase_unconfigured" }, { status: 501 });
  }

  /** 최종 설계 S53 · API A15 — 조회 예외를 빈 목록(전부 「연결 안 됨」)으로 응답하지 않는다 */
  let identities: Awaited<ReturnType<typeof findIdentitiesByUserId>>;
  try {
    identities = await findIdentitiesByUserId(sb, auth.userId);
  } catch {
    return NextResponse.json({ ok: false, errorCode: "identities_load_failed" }, { status: 500 });
  }
  const linked = new Set(identities.map((row) => row.provider));

  const providers = LINKABLE_AUTH_PROVIDERS.map((provider) => ({
    provider,
    linked: linked.has(provider),
    linkedAt: identities.find((row) => row.provider === provider)?.linked_at ?? null,
  }));

  return NextResponse.json({ ok: true, providers });
}
