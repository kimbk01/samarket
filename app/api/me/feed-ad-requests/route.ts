import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { normalizeFeedAdDestination } from "@/lib/ads/feed-ad-destination";
import { projectFeedAdMemberPresentation } from "@/lib/ads/feed-ad-member-presentation";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { getFeedAdProduct, listActiveFeedAdProducts } from "@/lib/ads/feed-ad-products";
import { holdPointsForFeedAdRequest } from "@/lib/ads/feed-ad-request-point-flow";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreativeIn = { imageUrl: string; altText?: string; headline?: string };

function mapRequestRow(
  row: Record<string, unknown>,
  extras?: {
    creatives?: { sortOrder: number; imageUrl: string; altText: string; headline: string }[];
    startAt?: string | null;
    endAt?: string | null;
    holdStatus?: string | null;
  }
) {
  const startAt =
    extras?.startAt ??
    (row.start_at != null ? String(row.start_at) : null);
  const endAt =
    extras?.endAt ??
    (row.end_at != null ? String(row.end_at) : null);
  const presentation = projectFeedAdMemberPresentation({
    requestStatus: String(row.status ?? ""),
    startAt,
    endAt,
  });
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? ""),
    displayStatus: presentation.displayStatus,
    eligible: presentation.eligible,
    remainingMs: presentation.remainingMs,
    domain: String(row.domain ?? ""),
    placement: String(row.placement ?? ""),
    productId: String(row.product_id ?? ""),
    pointCost: Number(row.point_cost ?? 0),
    durationDays: Number(row.duration_days ?? 0),
    targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
    targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
    destinationType: String(row.destination_type ?? ""),
    destinationId: String(row.destination_id ?? ""),
    destinationUrl: String(row.destination_url ?? ""),
    reviewReason: row.review_reason != null ? String(row.review_reason) : null,
    campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    createdAt: String(row.created_at ?? ""),
    creatives: extras?.creatives ?? [],
    startAt,
    endAt,
    holdStatus: extras?.holdStatus ?? null,
  };
}

/** GET — member feed ad request list + product catalog */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const domain = (req.nextUrl.searchParams.get("domain") || "").trim() as FeedAdDomain | "";
  const catalog = listActiveFeedAdProducts(domain || undefined);

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, requests: [], catalog });
  }

  const { data, error } = await sb
    .from("feed_ad_requests")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("feed_ad_requests")) {
      return NextResponse.json({ ok: true, requests: [], catalog, tableMissing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  const campaignIds = rows
    .map((r) => (r.campaign_id != null ? String(r.campaign_id) : ""))
    .filter(Boolean);

  const [{ data: creatives }, { data: campaigns }, { data: holds }] = await Promise.all([
    ids.length
      ? sb
          .from("feed_ad_request_creatives")
          .select("*")
          .in("request_id", ids)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    campaignIds.length
      ? sb.from("feed_ad_campaigns").select("id, start_at, end_at").in("id", campaignIds)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? sb
          .from("feed_ad_point_holds")
          .select("request_id, status")
          .in("request_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const byReq = new Map<string, { sortOrder: number; imageUrl: string; altText: string; headline: string }[]>();
  for (const c of creatives ?? []) {
    const cr = c as Record<string, unknown>;
    const rid = String(cr.request_id ?? "");
    const list = byReq.get(rid) ?? [];
    list.push({
      sortOrder: Number(cr.sort_order ?? 1),
      imageUrl: String(cr.image_url ?? ""),
      altText: String(cr.alt_text ?? ""),
      headline: String(cr.headline ?? ""),
    });
    byReq.set(rid, list);
  }

  const campById = new Map<string, { startAt: string | null; endAt: string | null }>();
  for (const c of campaigns ?? []) {
    const row = c as Record<string, unknown>;
    campById.set(String(row.id ?? ""), {
      startAt: row.start_at != null ? String(row.start_at) : null,
      endAt: row.end_at != null ? String(row.end_at) : null,
    });
  }

  const holdByReq = new Map<string, string>();
  for (const h of holds ?? []) {
    const row = h as Record<string, unknown>;
    const rid = String(row.request_id ?? "");
    if (rid && !holdByReq.has(rid)) {
      holdByReq.set(rid, String(row.status ?? ""));
    }
  }

  return NextResponse.json({
    ok: true,
    requests: rows.map((r) => {
      const id = String(r.id ?? "");
      const cid = r.campaign_id != null ? String(r.campaign_id) : "";
      const camp = cid ? campById.get(cid) : undefined;
      return mapRequestRow(r, {
        creatives: byReq.get(id) ?? [],
        startAt: camp?.startAt ?? null,
        endAt: camp?.endAt ?? null,
        holdStatus: holdByReq.get(id) ?? null,
      });
    }),
    catalog,
  });
}

/** POST — create request + HOLD */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: {
    productId?: string;
    placement?: string;
    targetCategoryId?: string;
    targetTopicSlug?: string;
    destinationType?: string;
    destinationId?: string;
    destinationUrl?: string;
    creatives?: CreativeIn[];
    idempotencyKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const idempotencyKey = (
    req.headers.get("idempotency-key") ??
    body.idempotencyKey ??
    ""
  )
    .trim()
    .slice(0, 128);

  const product = getFeedAdProduct(String(body.productId ?? ""));
  if (!product) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 400 });
  }

  // F7: replay same Idempotency-Key → existing request, no second HOLD.
  if (idempotencyKey) {
    const { data: existing } = await sb
      .from("feed_ad_requests")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        requestId: String(existing.id),
        status: String((existing as { status?: string }).status ?? "pending_review"),
        idempotentReplay: true,
      });
    }
  }

  const placement = String(body.placement ?? "").trim() as FeedAdPlacement;
  const validPlacement: FeedAdPlacement[] = [
    "TRADE_HOME",
    "TRADE_CATEGORY",
    "COMMUNITY_HOME",
    "COMMUNITY_TOPIC",
  ];
  if (!validPlacement.includes(placement)) {
    return NextResponse.json({ ok: false, error: "invalid_placement" }, { status: 400 });
  }
  if (product.domain === "trade" && !placement.startsWith("TRADE_")) {
    return NextResponse.json({ ok: false, error: "placement_domain_mismatch" }, { status: 400 });
  }
  if (product.domain === "community" && !placement.startsWith("COMMUNITY_")) {
    return NextResponse.json({ ok: false, error: "placement_domain_mismatch" }, { status: 400 });
  }
  if (placement === "TRADE_CATEGORY" && !String(body.targetCategoryId ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "category_required" }, { status: 400 });
  }
  if (placement === "COMMUNITY_TOPIC" && !String(body.targetTopicSlug ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "topic_required" }, { status: 400 });
  }

  const creatives = (Array.isArray(body.creatives) ? body.creatives : [])
    .map((c) => ({
      imageUrl: String(c.imageUrl ?? "").trim(),
      altText: String(c.altText ?? "").trim(),
      headline: String(c.headline ?? "").trim(),
    }))
    .filter((c) => c.imageUrl.length > 0)
    .slice(0, 3);
  if (creatives.length < 1) {
    return NextResponse.json({ ok: false, error: "creatives_required" }, { status: 400 });
  }

  const dest = normalizeFeedAdDestination({
    destinationType: String(body.destinationType ?? "none"),
    destinationId: body.destinationId,
    destinationUrl: body.destinationUrl,
  });
  if (!dest.ok) {
    return NextResponse.json({ ok: false, error: dest.error }, { status: 400 });
  }

  const requestId = randomUUID();

  const insertPayload: Record<string, unknown> = {
    id: requestId,
    user_id: auth.userId,
    product_id: product.id,
    domain: product.domain,
    placement,
    target_category_id:
      placement === "TRADE_CATEGORY" ? String(body.targetCategoryId ?? "").trim() : null,
    target_topic_slug:
      placement === "COMMUNITY_TOPIC" ? String(body.targetTopicSlug ?? "").trim() : null,
    destination_type: dest.value.destinationType,
    destination_id: dest.value.destinationId,
    destination_url: dest.value.destinationUrl,
    duration_days: product.durationDays,
    point_cost: product.pointCost,
    status: "pending_review",
  };
  if (idempotencyKey) {
    insertPayload.idempotency_key = idempotencyKey;
  }

  const { error: insErr } = await sb.from("feed_ad_requests").insert(insertPayload);

  if (insErr) {
    if (insErr.message?.includes("feed_ad_requests")) {
      return NextResponse.json(
        { ok: false, error: "table_missing", hint: "run migration 20261024120000" },
        { status: 503 }
      );
    }
    // Unique idempotency race: return existing row (no second HOLD).
    if (
      idempotencyKey &&
      (/duplicate|unique|feed_ad_requests_user_idempotency/i.test(insErr.message ?? "") ||
        (insErr as { code?: string }).code === "23505")
    ) {
      const { data: raced } = await sb
        .from("feed_ad_requests")
        .select("*")
        .eq("user_id", auth.userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced?.id) {
        return NextResponse.json({
          ok: true,
          requestId: String(raced.id),
          status: String((raced as { status?: string }).status ?? "pending_review"),
          idempotentReplay: true,
        });
      }
    }
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  const { error: crErr } = await sb.from("feed_ad_request_creatives").insert(
    creatives.map((c, i) => ({
      request_id: requestId,
      sort_order: i + 1,
      image_url: c.imageUrl,
      alt_text: c.altText,
      headline: c.headline,
    }))
  );
  if (crErr) {
    await sb.from("feed_ad_requests").delete().eq("id", requestId);
    return NextResponse.json({ ok: false, error: crErr.message }, { status: 500 });
  }

  const hold = await holdPointsForFeedAdRequest(sb, {
    userId: auth.userId,
    requestId,
    pointCost: product.pointCost,
  });
  if (!hold.ok) {
    await sb.from("feed_ad_requests").delete().eq("id", requestId);
    return NextResponse.json(
      { ok: false, error: hold.error },
      { status: hold.error === "insufficient_balance" ? 402 : 500 }
    );
  }

  if (hold.holdId) {
    await sb.from("feed_ad_requests").update({ hold_id: hold.holdId }).eq("id", requestId);
  }

  return NextResponse.json({ ok: true, requestId, status: "pending_review" });
}
