import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import {
  checkStorePartnerAgreementInput,
  normalizePartnerLocale,
  parseStorePartnerAgreementInput,
  storeHasAgreedToVersion,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  buildStorePartnerOfferForStore,
  listStorePartnerAgreements,
  loadLegalDocumentsByIds,
  loadStoreLaunchFreeOverride,
  recordStorePartnerAgreement,
} from "@/lib/stores/partner/store-partner-agreement.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OwnerCtx =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>;
      userId: string;
      storeId: string;
      categoryId: string | null;
      topicId: string | null;
      taxonomy: { category: TaxonomyName | null; topic: TaxonomyName | null };
    };

type TaxonomyName = { slug: string; name: string; nameEn: string | null };

function taxonomyName(v: unknown): TaxonomyName | null {
  const r = (Array.isArray(v) ? v[0] : v) as { slug?: unknown; name?: unknown; name_en?: unknown } | null | undefined;
  if (!r) return null;
  const slug = String(r.slug ?? "").trim();
  const name = String(r.name ?? "").trim();
  if (!slug && !name) return null;
  return { slug, name, nameEn: typeof r.name_en === "string" && r.name_en.trim() ? r.name_en.trim() : null };
}

async function ownerContext(context: { params: Promise<{ storeId: string }> }): Promise<OwnerCtx> {
  const userId = await getRouteUserId();
  if (!userId) return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const session = await validateActiveSession(userId);
  if (!session.ok) return { ok: false, response: session.response };
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return { ok: false, response: NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 }) };
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 }) };
  }
  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return { ok: false, response: NextResponse.json({ ok: false, error: gate.error }, { status: gate.status }) };
  const { data: tax } = await sb
    .from("stores")
    .select("store_category_id, store_topic_id, store_categories ( slug, name, name_en ), store_topics ( slug, name, name_en )")
    .eq("id", sid)
    .maybeSingle();
  const row = (tax ?? {}) as {
    store_category_id?: string | null;
    store_topic_id?: string | null;
    store_categories?: unknown;
    store_topics?: unknown;
  };
  return {
    ok: true,
    sb,
    userId,
    storeId: sid,
    categoryId: row.store_category_id ?? null,
    topicId: row.store_topic_id ?? null,
    taxonomy: { category: taxonomyName(row.store_categories), topic: taxonomyName(row.store_topics) },
  };
}

/**
 * 사장님 「입점 계약」 — 내가 동의한 계약 목록(버전·동의 시각·무료 종료일·무료 후 요율·원문) +
 * 지금 게시된 약관과 조건 + 재동의 필요 여부. 동의하지 않아도 다른 기능은 막지 않는다 (안내만).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await ownerContext(context);
  if (!ctx.ok) return ctx.response;
  const locale = normalizePartnerLocale(req.nextUrl.searchParams.get("locale"));

  const list = await listStorePartnerAgreements(ctx.sb, ctx.storeId);
  if (!list.ok) return internalErrorResponse("load_failed", "[partner-agreement GET] list", "list_failed", 500);
  const ov = await loadStoreLaunchFreeOverride(ctx.sb, ctx.storeId);
  if (!ov.ok) return internalErrorResponse("load_failed", "[partner-agreement GET] override", "override_failed", 500);
  const offer = await buildStorePartnerOfferForStore(ctx.sb, {
    locale,
    storeId: ctx.storeId,
    categoryId: ctx.categoryId,
    topicId: ctx.topicId,
    agreements: list.rows,
    overrideFreeUntil: ov.override?.freeUntil ?? null,
  });
  if (!offer.ok) return internalErrorResponse("load_failed", "[partner-agreement GET] offer", offer.error, 500);
  const documents = await loadLegalDocumentsByIds(
    ctx.sb,
    list.rows.map((r) => r.legalDocumentId)
  );
  const currentVersion = offer.offer.terms?.version ?? null;
  return NextResponse.json(
    {
      ok: true as const,
      agreements: list.rows.map((r) => ({
        id: r.id,
        version: r.documentVersion,
        locale: r.locale,
        source: r.source,
        agreedAt: r.agreedAt,
        freeUntil: r.freeUntil,
        feePercentAfter: r.feePercentAfter,
        documentId: r.legalDocumentId,
      })),
      documents,
      taxonomy: ctx.taxonomy,
      current: offer.offer,
      needsReconsent: Boolean(currentVersion) && !storeHasAgreedToVersion(list.rows, currentVersion),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}

/** 재동의 — 본문 `{ documentId, version, locale, agreeTerms: true, agreeFee: true }` → source 'reconsent' 1행 */
export async function POST(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const ctx = await ownerContext(context);
  if (!ctx.ok) return ctx.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const input = parseStorePartnerAgreementInput(body);

  const list = await listStorePartnerAgreements(ctx.sb, ctx.storeId);
  if (!list.ok) return internalErrorResponse("save_failed", "[partner-agreement POST] list", "list_failed", 500);
  const ov = await loadStoreLaunchFreeOverride(ctx.sb, ctx.storeId);
  if (!ov.ok) return internalErrorResponse("save_failed", "[partner-agreement POST] override", "override_failed", 500);
  const offer = await buildStorePartnerOfferForStore(ctx.sb, {
    locale: input?.locale ?? "ko",
    storeId: ctx.storeId,
    categoryId: ctx.categoryId,
    topicId: ctx.topicId,
    agreements: list.rows,
    overrideFreeUntil: ov.override?.freeUntil ?? null,
  });
  if (!offer.ok) return internalErrorResponse("save_failed", "[partner-agreement POST] offer", offer.error, 500);
  if (!offer.offer.terms) {
    return NextResponse.json({ ok: false, error: "partner_terms_not_published" }, { status: 409 });
  }
  const check = checkStorePartnerAgreementInput(offer.offer.terms, input);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  if (!check.required) return NextResponse.json({ ok: false, error: "partner_terms_not_published" }, { status: 409 });
  if (storeHasAgreedToVersion(list.rows, check.terms.version)) {
    return NextResponse.json({ ok: true as const, already: true });
  }

  const recorded = await recordStorePartnerAgreement(ctx.sb, {
    storeId: ctx.storeId,
    ownerUserId: ctx.userId,
    terms: check.terms,
    freeUntil: offer.offer.freeUntil,
    storeCategoryId: ctx.categoryId,
    storeTopicId: ctx.topicId,
    feePercentAfter: offer.offer.feePercentAfter,
    source: "reconsent",
  });
  if (!recorded.ok) {
    if (recorded.error === "duplicate") return NextResponse.json({ ok: true as const, already: true });
    return internalErrorResponse("save_failed", "[partner-agreement POST] insert", recorded.error, 500);
  }
  return NextResponse.json({ ok: true as const, agreementId: recorded.row.id });
}
