import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  toExternalBoardArticleAdminDto,
  toExternalBoardSourceAdminDto,
} from "@/lib/external-board-import/admin/dto";
import { listAuthorPools } from "@/lib/external-board-import/author/author-pool";
import { listExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";
import { EXTERNAL_BOARD_OWNER_E2E_GATE } from "@/lib/external-board-import/owner-e2e-gate";
import { EXTERNAL_BOARD_PUBLIC_INTEGRATION } from "@/lib/external-board-import/public/natural-integration";
import { listExternalBoardSources } from "@/lib/external-board-import/registry/source-board-store";
import { EXTERNAL_BOARD_PRODUCT_NAME } from "@/lib/external-board-import/product-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const [sources, articles, pools] = await Promise.all([
      listExternalBoardSources(sb),
      listExternalBoardArticles(sb),
      listAuthorPools(sb),
    ]);
    return NextResponse.json({
      ok: true,
      product: EXTERNAL_BOARD_PRODUCT_NAME,
      sources: sources.map(toExternalBoardSourceAdminDto),
      articles: articles.map(toExternalBoardArticleAdminDto),
      pools,
      ownerE2eGate: EXTERNAL_BOARD_OWNER_E2E_GATE,
      publicIntegration: EXTERNAL_BOARD_PUBLIC_INTEGRATION,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
