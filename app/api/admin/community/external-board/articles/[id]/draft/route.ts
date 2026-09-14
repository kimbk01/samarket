import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { validateExternalBoardDocument } from "@/lib/external-board-import/document/ordered-document";
import { applyReplacementPolicy, listReplacementRules } from "@/lib/external-board-import/policy/replacement";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Draft save / transform-apply — never writes community_posts.
 * RAW source_document / source_title are preserved.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      action?: "save" | "apply_transform" | "preview_transform";
      draftTitle?: string | null;
      draftDocument?: unknown;
    };
    const action = body.action ?? "save";
    const sb = getSupabaseServer();
    const article = await getExternalBoardArticle(sb, id);
    if (!article) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (article.published_post_id) {
      return NextResponse.json({ ok: false, error: "already_published" }, { status: 409 });
    }
    const source = await getExternalBoardSource(sb, article.source_id);
    if (!source) return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });

    if (action === "preview_transform") {
      const rules = await listReplacementRules(sb, source.id);
      const base = article.draft_document ?? article.source_document;
      const titleBase = article.draft_title?.trim() || article.source_title || base.title;
      const preview = applyReplacementPolicy({ ...base, title: titleBase }, rules);
      return NextResponse.json({
        ok: true,
        writeDelta: 0,
        preview: { title: preview.title, document: preview },
      });
    }

    if (action === "apply_transform") {
      const rules = await listReplacementRules(sb, source.id);
      const base = article.draft_document ?? article.source_document;
      const titleBase = article.draft_title?.trim() || article.source_title || base.title;
      const applied = applyReplacementPolicy({ ...base, title: titleBase }, rules);
      const { error } = await sb
        .from("external_board_articles")
        .update({
          draft_title: applied.title,
          draft_document: applied,
          edit_status: "editing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draftTitle: applied.title, draftDocument: applied });
    }

    // save
    const updates: Record<string, unknown> = {
      edit_status: "saved",
      updated_at: new Date().toISOString(),
    };
    if (body.draftTitle !== undefined) {
      updates.draft_title = body.draftTitle != null ? String(body.draftTitle) : null;
    }
    if (body.draftDocument !== undefined) {
      if (body.draftDocument == null) {
        updates.draft_document = null;
      } else {
        const v = validateExternalBoardDocument(body.draftDocument);
        if (!v.ok) return NextResponse.json({ ok: false, error: "invalid_draft_document" }, { status: 400 });
        updates.draft_document = v.document;
      }
    }
    const { error } = await sb.from("external_board_articles").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    const fresh = await getExternalBoardArticle(sb, id);
    return NextResponse.json({ ok: true, article: fresh });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
