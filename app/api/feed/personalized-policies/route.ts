import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createDefaultPersonalizedFeedBundle,
  loadPersonalizedFeedBundleFromDb,
} from "@/lib/personalized-feed/personalized-feed-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const sb = getSupabaseServer();
    const loaded = await loadPersonalizedFeedBundleFromDb(sb);
    const policies = loaded.ok ? loaded.bundle.policies : createDefaultPersonalizedFeedBundle().policies;
    return NextResponse.json({ ok: true, policies });
  } catch {
    return NextResponse.json({ ok: true, policies: createDefaultPersonalizedFeedBundle().policies });
  }
}
