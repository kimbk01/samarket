import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { createDefaultHomeFeedBundle, loadHomeFeedBundleFromDb } from "@/lib/home-feed/home-feed-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 공개 읽기: 홈 피드 정책 (비밀 정보 없음) */
export async function GET(): Promise<NextResponse> {
  try {
    const sb = getSupabaseServer();
    const loaded = await loadHomeFeedBundleFromDb(sb);
    const policies = loaded.ok ? loaded.bundle.policies : createDefaultHomeFeedBundle().policies;
    return NextResponse.json({ ok: true, policies });
  } catch {
    return NextResponse.json({ ok: true, policies: createDefaultHomeFeedBundle().policies });
  }
}
