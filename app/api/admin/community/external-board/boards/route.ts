import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertWriteEligibleTopicId } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";
import {
  SOURCE_BOARD_ALREADY_REGISTERED,
  createExternalBoardSource,
  ExternalBoardSourceDuplicateError,
  listExternalBoardSources,
} from "@/lib/external-board-import/registry/source-board-store";
import { normalizeRightsStatus } from "@/lib/external-board-import/rights/rights-gate";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DUPLICATE_OPERATOR_MESSAGE = "이미 등록된 외부 게시판입니다.";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const sources = await listExternalBoardSources(sb);
    return NextResponse.json({ ok: true, sources });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sourceUrl = String(body.sourceUrl ?? "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ ok: false, error: "게시판 URL이 필요합니다." }, { status: 400 });
    }
    const targetTopicId = body.targetTopicId != null ? String(body.targetTopicId).trim() : "";
    if (!targetTopicId) {
      return NextResponse.json({ ok: false, error: "게시할 DIBAY 주제를 선택하세요." }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const topic = await assertWriteEligibleTopicId(sb, targetTopicId);
    if (!topic.ok) {
      return NextResponse.json({ ok: false, error: topic.failureMessage }, { status: 400 });
    }
    const rightsBasis =
      body.rightsBasis != null ? String(body.rightsBasis).trim() : "";
    const source = await createExternalBoardSource(sb, {
      sourceUrl,
      sourceBoardName: body.sourceBoardName != null ? String(body.sourceBoardName) : undefined,
      siteName: body.siteName != null ? String(body.siteName) : undefined,
      mode: "MANUAL",
      targetTopicId: topic.topic.id,
      targetTopicSlug: topic.topic.slug,
      authorPoolId: body.authorPoolId != null ? String(body.authorPoolId) : null,
      attributionRequired: false,
      enabled: body.enabled != null ? Boolean(body.enabled) : true,
      // Official catalog sources may declare public-republish rights without operator tech jargon.
      rightsBasis: rightsBasis || null,
      rightsStatus: rightsBasis ? "declared" : normalizeRightsStatus(body.rightsStatus),
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    if (e instanceof ExternalBoardSourceDuplicateError) {
      return NextResponse.json(
        {
          ok: false,
          code: SOURCE_BOARD_ALREADY_REGISTERED,
          error: DUPLICATE_OPERATOR_MESSAGE,
          existingSourceId: e.existingSource.id,
          source: e.existingSource,
        },
        { status: 409 }
      );
    }
    const msg = String((e as Error).message);
    const status = msg === "invalid_source_url" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
