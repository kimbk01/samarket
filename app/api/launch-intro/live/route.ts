import { NextRequest, NextResponse } from "next/server";
import { buildLaunchIntroLivePayload } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * DIBAY Intro — PUBLICATION DISCOVERY (contract §4, live manifest cache contract).
 * Cache-Control: no-store — no CDN / ISR copy, every request reads the origin Live row,
 * so Pause / Resume / Unpublish revisions are never delayed by a stale response.
 * Startup never waits for this route (called only after the OS release / on resume).
 */
const NO_STORE = { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" };

const EPOCH_RE = /^[0-9A-Fa-f-]{36}$/;
const DOC_RE = /^[0-9A-Za-z-]{1,40}$/;

export async function GET(req: NextRequest) {
  const epoch = req.headers.get("x-dibay-launch-epoch") ?? "";
  const doc = req.headers.get("x-dibay-launch-doc") ?? "";
  const reason = req.headers.get("x-dibay-discovery-reason") ?? "";
  console.info(
    JSON.stringify({
      tag: "launch_intro_discovery",
      epoch: EPOCH_RE.test(epoch) ? epoch : null,
      doc: DOC_RE.test(doc) ? doc : null,
      reason: /^[a-z_]{1,24}$/.test(reason) ? reason : null,
      platform: (req.headers.get("x-dibay-platform") ?? "").slice(0, 12) || null,
    })
  );

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });
  const built = await buildLaunchIntroLivePayload(sb);
  if (!built.ok) return NextResponse.json({ ok: false, error: built.error }, { status: 500, headers: NO_STORE });
  return NextResponse.json(built.payload, { headers: NO_STORE });
}
