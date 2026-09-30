import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  deleteIntroDocument,
  duplicateIntroDocument,
  renameIntroDocument,
  getIntroDocument,
  updateIntroDocumentContentClass,
} from "@/lib/intro/document/service";
import type { IntroDataClass } from "@/lib/intro/admin/operator-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ documentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { documentId } = await ctx.params;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: {
    action?: string;
    title?: string;
    expectedDraftVersion?: number;
    contentClass?: IntroDataClass;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const action = body.action;
  try {
    if (action === "duplicate") {
      const document = await duplicateIntroDocument(sb, {
        documentId,
        userId: admin.userId,
        title: body.title,
      });
      return NextResponse.json({ ok: true as const, document });
    }
    if (action === "rename") {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
      }
      const current = await getIntroDocument(sb, documentId);
      if (!current) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      const document = await renameIntroDocument(sb, {
        documentId,
        title: body.title,
        expectedDraftVersion:
          typeof body.expectedDraftVersion === "number"
            ? body.expectedDraftVersion
            : current.draft_version,
        userId: admin.userId,
      });
      return NextResponse.json({ ok: true as const, document });
    }
    if (action === "set_content_class") {
      if (
        body.contentClass !== "OWNER" &&
        body.contentClass !== "QA" &&
        body.contentClass !== "SYSTEM"
      ) {
        return NextResponse.json(
          { ok: false, error: "content_class_required" },
          { status: 400 },
        );
      }
      const document = await updateIntroDocumentContentClass(sb, {
        documentId,
        contentClass: body.contentClass,
        userId: admin.userId,
      });
      return NextResponse.json({ ok: true as const, document });
    }
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "action_failed";
    const status = (e as { status?: number }).status === 409 ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { documentId } = await ctx.params;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    await deleteIntroDocument(sb, { documentId, userId: admin.userId });
    return NextResponse.json({ ok: true as const, deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "delete_failed";
    const status =
      msg === "cannot_delete_live_intro"
        ? 409
        : msg === "document_not_found"
          ? 404
          : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
