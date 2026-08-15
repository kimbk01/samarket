import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/create
 * 거래·커뮤니티·서비스 글 신규 등록 — service_role 로 posts INSERT (클라이언트는 posts SELECT 권한 없음).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import type { ProfileActionType } from "@/lib/profile/profile-requirements";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { buildCreatePostInsertRow } from "@/lib/posts/build-create-post-insert-row";
import type { CreatePostPayload, PostType } from "@/lib/posts/types";
import { publicRegionLabelLeaksPrivateDetail } from "@/lib/addresses/community-public-region-label";
import { assertActiveTradeNationalLgu } from "@/lib/trade/location/national/assert-active-trade-national-lgu";

const ALLOWED_TYPES: PostType[] = ["trade", "community", "service", "feature"];

function parseCreatePayload(body: unknown): CreatePostPayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "JSON 본문이 필요합니다." };
  }
  const raw = body as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!ALLOWED_TYPES.includes(type as PostType)) {
    return { error: "유효하지 않은 글 유형입니다." };
  }
  const categoryId = typeof raw.categoryId === "string" ? raw.categoryId.trim() : "";
  if (!categoryId) {
    return { error: "카테고리가 필요합니다." };
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!title) return { error: "제목을 입력해 주세요." };
  if (!content) return { error: "내용을 입력해 주세요." };

  const base = { type: type as PostType, categoryId, title, content };

  if (type === "trade") {
    const region = typeof raw.region === "string" ? raw.region : undefined;
    const city = typeof raw.city === "string" ? raw.city : undefined;
    const tradeLguId = typeof raw.tradeLguId === "string" ? raw.tradeLguId.trim() : undefined;
    const barangay = typeof raw.barangay === "string" ? raw.barangay : undefined;
    if (
      publicRegionLabelLeaksPrivateDetail(region ?? "") ||
      publicRegionLabelLeaksPrivateDetail(city ?? "") ||
      publicRegionLabelLeaksPrivateDetail(barangay ?? "")
    ) {
      return { error: "region_label_invalid" };
    }
    return {
      ...base,
      type: "trade",
      price: raw.price != null ? Number(raw.price) : null,
      isPriceOfferEnabled: raw.isPriceOfferEnabled === true,
      isFreeShare: raw.isFreeShare === true,
      region,
      city,
      tradeLguId: tradeLguId || undefined,
      barangay,
      imageUrls: Array.isArray(raw.imageUrls)
        ? raw.imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        : undefined,
      meta:
        raw.meta != null && typeof raw.meta === "object" && !Array.isArray(raw.meta)
          ? (raw.meta as Record<string, unknown>)
          : undefined,
      tradeJob:
        raw.tradeJob != null && typeof raw.tradeJob === "object" && !Array.isArray(raw.tradeJob)
          ? (raw.tradeJob as CreatePostPayload & { type: "trade" })["tradeJob"]
          : undefined,
    };
  }

  if (type === "service") {
    const region = typeof raw.region === "string" ? raw.region : undefined;
    const city = typeof raw.city === "string" ? raw.city : undefined;
    const barangay = typeof raw.barangay === "string" ? raw.barangay : undefined;
    if (
      publicRegionLabelLeaksPrivateDetail(region ?? "") ||
      publicRegionLabelLeaksPrivateDetail(city ?? "") ||
      publicRegionLabelLeaksPrivateDetail(barangay ?? "")
    ) {
      return { error: "region_label_invalid" };
    }
    return {
      ...base,
      type: "service",
      contactMethod: typeof raw.contactMethod === "string" ? raw.contactMethod : undefined,
      region,
      city,
      barangay,
    };
  }

  if (type === "community") {
    return { ...base, type: "community" };
  }

  return { ...base, type: "feature" };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const parsed = parseCreatePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  if (parsed.type === "trade") {
    const tradeLguId =
      "tradeLguId" in parsed && typeof parsed.tradeLguId === "string"
        ? parsed.tradeLguId.trim()
        : "";
    const lguGate = assertActiveTradeNationalLgu(tradeLguId);
    if (!lguGate.ok) {
      return NextResponse.json(
        { ok: false, error: lguGate.error, code: "trade_lgu_id_invalid" },
        { status: 400 }
      );
    }
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const access = await requireSignupCompleteForUser(sb as import("@supabase/supabase-js").SupabaseClient, userId);
  if (!access.ok) return access.response;

  let profileAction: ProfileActionType | null = null;
  if (parsed.type === "trade") profileAction = "trade_create_item";
  else if (parsed.type === "community") profileAction = "community_write";

  if (profileAction) {
    const profileGate = await requireProfileFieldsForAction(
      sb as import("@supabase/supabase-js").SupabaseClient,
      userId,
      profileAction
    );
    if (!profileGate.ok) return profileGate.response;
  } else {
    const memberGate = await assertVerifiedMemberForAction(
      sb as import("@supabase/supabase-js").SupabaseClient,
      userId
    );
    if (!memberGate.ok) {
      return NextResponse.json({ ok: false, error: memberGate.error }, { status: memberGate.status });
    }
  }

  const row = buildCreatePostInsertRow(parsed, userId);
  const { data, error } = await (sb as import("@supabase/supabase-js").SupabaseClient)
    .from(POSTS_TABLE_WRITE)
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "저장에 실패했습니다." },
      { status: 500 }
    );
  }

  const id = typeof data?.id === "string" ? data.id.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "저장에 실패했습니다." }, { status: 500 });
  }

  if (parsed.type === "community") {
    const { mirrorLegacyCommunityPostToSsot } = await import(
      "@/lib/community-feed/mirror-legacy-community-post"
    );
    await mirrorLegacyCommunityPostToSsot(
      sb as import("@supabase/supabase-js").SupabaseClient,
      id,
      userId
    ).catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[posts/create] community SSOT mirror:", err);
      }
    });
  }

  return NextResponse.json({ ok: true, id });
}
