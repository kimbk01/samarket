import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tradePostHeadlineForMessengerList } from "@/lib/community-messenger/trade-chat-list/trade-post-row-fields";
import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { formatPrice } from "@/lib/utils/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);
  const e = error as Record<string, unknown>;
  const nested =
    e.error != null && typeof e.error === "object"
      ? supabaseErrorMessage(e.error)
      : "";
  const parts = [
    e.message,
    e.msg,
    e.description,
    e.details,
    e.hint,
    nested,
  ].filter((x) => typeof x === "string") as string[];
  return parts.join(" ").trim();
}

/** 컬럼 누락·스키마 불일치 시 더 얕은 SELECT 로 재시도 */
function shouldRetryPostSelectWithReducedColumns(error: unknown): boolean {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "42703") return true;
  const msg = supabaseErrorMessage(error).toLowerCase();
  return (
    /column .+ does not exist/i.test(msg) ||
    msg.includes("unknown column") ||
    msg.includes("could not find") ||
    msg.includes("schema cache")
  );
}

/**
 * 거래 채팅 목록 2행 — `contextMeta.headline` 이 비거나 "거래" 일 때 `postId` 로
 * `posts` 에서 제목·가격 문자열을 확정한다 (목록 전용, 썸네일 API와 분리).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:trade-post-list-preview:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_trade_post_list_preview_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const postId = req.nextUrl.searchParams.get("postId")?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "post_id_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  /**
   * 반드시 실테이블 `posts` 를 사용한다.
   * `posts_masked` 뷰는 마이그레이션 시점 컬럼 목록으로 생성되어, 이후 `posts` 에서 컬럼이 빠지면
   * 뷰 정의에 고아 참조(예: `p.currency`)가 남아 **어떤 SELECT 도 실패**할 수 있다.
   * 본 라우트는 서비스 롤만 사용하며 마스킹 뷰 불필요(민감 필드 미조회).
   */
  const selectTiers = ["id, title, price, meta", "id, title, price"] as const;
  let post: Record<string, unknown> | null = null;
  let lastErrorMessage = "";
  for (const sel of selectTiers) {
    const { data, error } = await sb.from(POSTS_TABLE_WRITE).select(sel).eq("id", postId).maybeSingle();
    if (!error) {
      if (!data) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      if (typeof data === "object") {
        post = data as Record<string, unknown>;
        break;
      }
      continue;
    }
    const msg = supabaseErrorMessage(error);
    lastErrorMessage = msg || lastErrorMessage;
    if (!shouldRetryPostSelectWithReducedColumns(error)) {
      return NextResponse.json({ ok: false, error: msg || "posts_fetch_failed" }, { status: 500 });
    }
  }

  if (!post) {
    return NextResponse.json(
      { ok: false, error: lastErrorMessage || "posts_fetch_failed" },
      { status: 500 }
    );
  }

  const row = post;
  const title = tradePostHeadlineForMessengerList(row) || "거래";
  const priceRaw = row.price;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null
        ? Number(priceRaw)
        : null;
  let currency = "PHP";
  const metaRaw = row.meta;
  if (metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)) {
    const mc = (metaRaw as Record<string, unknown>).currency;
    if (typeof mc === "string" && mc.trim()) currency = mc.trim();
  }
  const priceLabel =
    price != null && Number.isFinite(price) && !Number.isNaN(price) && price >= 0 ? formatPrice(price, currency) : null;

  return NextResponse.json({ ok: true, title, priceLabel });
}
