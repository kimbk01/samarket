import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { upsertBoardImportSource, updateBoardCheckResult } from "@/lib/community-board-import/store";
import { runBoardCheck } from "@/lib/community-board-import/run-board-check";
import type { BoardImportMode } from "@/lib/community-board-import/product-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as {
      siteName?: string;
      sourceBoardName?: string;
      sourceUrl?: string;
      targetTopicId?: string | null;
      mode?: BoardImportMode;
      authorPoolId?: string | null;
      dateRecentMinDays?: number;
      dateRecentMaxDays?: number;
      viewSeedMin?: number;
      viewSeedMax?: number;
    };
    const siteName = String(body.siteName ?? "").trim();
    const sourceBoardName = String(body.sourceBoardName ?? "").trim();
    const sourceUrl = String(body.sourceUrl ?? "").trim();
    if (!siteName || !sourceBoardName || !sourceUrl) {
      return NextResponse.json({ ok: false, error: "required_fields" }, { status: 400 });
    }
    if (!body.targetTopicId) {
      return NextResponse.json({ ok: false, error: "target_required" }, { status: 400 });
    }

    const sb = getSupabaseServer();
    const check = await runBoardCheck({ sb, sourceUrl });
    if (check.registration.duplicate) {
      return NextResponse.json({
        ok: false,
        error: "duplicate_board",
        registration: check.registration,
        check,
      });
    }

    const created = await upsertBoardImportSource(sb, {
      siteName,
      sourceBoardName,
      sourceUrl,
      targetTopicId: body.targetTopicId,
      mode: body.mode === "AUTO" ? "AUTO" : "MANUAL",
      authorPoolId: body.authorPoolId ?? null,
      dateRecentMinDays: body.dateRecentMinDays,
      dateRecentMaxDays: body.dateRecentMaxDays,
      viewSeedMin: body.viewSeedMin,
      viewSeedMax: body.viewSeedMax,
    });
    if (!created.ok) {
      return NextResponse.json({
        ok: false,
        error: "duplicate_board",
        registration: { duplicate: true, existing: created.duplicate, message: "이미 등록된 게시판입니다." },
        check,
      });
    }

    await updateBoardCheckResult(sb, created.row.id, {
      checkStatus: check.status,
      checkReasons: check.reasons,
    });

    return NextResponse.json({ ok: true, source: created.row, check });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "register_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
