import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertWriteEligibleTopicId } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";
import {
  getExternalBoardSource,
  patchExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const source = await getExternalBoardSource(sb, id);
    if (!source) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sb = getSupabaseServer();

    let targetTopicId = body.targetTopicId != null ? String(body.targetTopicId) : undefined;
    let targetTopicSlug = body.targetTopicSlug != null ? String(body.targetTopicSlug) : undefined;
    if (targetTopicId !== undefined) {
      const topic = await assertWriteEligibleTopicId(sb, targetTopicId);
      if (!topic.ok) {
        return NextResponse.json({ ok: false, error: topic.failureMessage }, { status: 400 });
      }
      targetTopicId = topic.topic.id;
      targetTopicSlug = topic.topic.slug;
    }

    const source = await patchExternalBoardSource(sb, id, {
      targetTopicId,
      targetTopicSlug,
      authorPoolId: body.authorPoolId != null ? String(body.authorPoolId) : undefined,
      sourceBoardName: body.sourceBoardName != null ? String(body.sourceBoardName) : undefined,
      siteName: body.siteName != null ? String(body.siteName) : undefined,
      enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
      attributionRequired: false,
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
