import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { parseJsonBody } from "@/lib/http/api-route";
import { parseExplicitAppLanguage } from "@/lib/i18n/config";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 언어 SSOT S8-6 — 이 기기에서 앱이 쓰는 언어(ko/en)를 `user_devices.app_language` 에 기록한다.
 * 서버 알림 문구 언어 = 계정 명시값 → 최근 활성 기기의 이 값 → en (`notification-user-language.ts`).
 * 본인 계정 + 이 기기(device_id) 행만 바꾼다. 기기 등록(토큰·통화) 경로와는 별개 — 다른 열은 건드리지 않는다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<{ device_id?: unknown; language?: unknown }>(req);
  const body = parsed.ok ? parsed.value : {};
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const language = parseExplicitAppLanguage(body.language);
  if (!deviceId || deviceId.length > 200 || !language) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data, error } = await svc
    .from("user_devices")
    .update({ app_language: language })
    .eq("user_id", auth.userId)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: Array.isArray(data) ? data.length : 0 });
}
