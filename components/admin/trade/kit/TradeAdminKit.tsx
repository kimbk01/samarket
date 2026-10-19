"use client";

/**
 * 거래 Admin 화면 공통 부품 (설계 v2 §D). 목록·필터·탭·페이지네이션·조치 시트는 커뮤니티 Admin 키트를 그대로 쓴다
 * (`@/components/admin/community/kit/CommunityAdminKit` — 같은 UI/UX/CTA SSOT). 여기에는 거래 고유 부품만 둔다.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { imageSanitizeViewerMediaUrl } from "@/lib/image/image-url";
import { loadTradeFeedThumbnailFetchUrl } from "@/lib/image/image-loader";
import {
  MODERATION_STATE_LABELS,
  OWNER_STATE_LABELS,
  SELLER_STAGE_LABELS,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

/**
 * 거래글 썸네일 — 사용자 앱 목록 카드(`components/post/PostCard.tsx`)와 같은 규칙:
 * `thumbnail_url` → 없으면 `images[0]`, 같은 sanitize · 같은 리사이즈 URL, 없거나 실패하면 빈 칸 (대체 이미지 없음).
 */
export function resolveTradeAdminThumbnailUrl(post: { thumbnail_url?: unknown; images?: unknown }): string | null {
  const first = Array.isArray(post.images) && post.images.length > 0 ? String(post.images[0] ?? "") : null;
  const raw = (typeof post.thumbnail_url === "string" && post.thumbnail_url) || first;
  const safe = imageSanitizeViewerMediaUrl(raw || null);
  if (!safe) return null;
  return loadTradeFeedThumbnailFetchUrl(safe) ?? safe;
}

export function TradePostThumb({
  post,
  size = 48,
}: {
  post: { thumbnail_url?: unknown; images?: unknown; title?: unknown };
  size?: number;
}) {
  const url = useMemo(() => resolveTradeAdminThumbnailUrl(post), [post]);
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!url || failed) {
    return <span aria-hidden style={box} className="block shrink-0 rounded-ui-rect border border-sam-border-soft bg-sam-app" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 사용자 앱과 같은 리사이즈 URL 을 그대로 쓴다
    <img
      src={url}
      alt=""
      style={box}
      loading="lazy"
      onError={() => setFailed(true)}
      className="block shrink-0 rounded-ui-rect border border-sam-border-soft object-cover"
    />
  );
}

const STAGE_TONE: Record<string, AdminTone> = {
  inquiry: "progress",
  negotiating: "progress",
  reserved: "waiting",
  completed: "success",
};

/** 판매 단계 (판매 상태) */
export function TradeStageBadge({ value }: { value: string | null | undefined }) {
  const v = String(value ?? "");
  return <AdminToneBadge tone={STAGE_TONE[v] ?? "neutral"}>{SELLER_STAGE_LABELS[v] ?? "—"}</AdminToneBadge>;
}

/** 노출 상태 — 관리자 노출과 판매자 노출을 따로 보여 준다 (섞지 않음) */
export function TradeVisibilityBadges({
  moderationState,
  ownerState,
}: {
  moderationState: string | null | undefined;
  ownerState: string | null | undefined;
}) {
  const m = String(moderationState ?? "visible");
  const o = String(ownerState ?? "none");
  if (m === "visible" && o === "none") return <AdminToneBadge tone="success">노출</AdminToneBadge>;
  return (
    <span className="flex flex-wrap gap-1">
      {m !== "visible" ? (
        <AdminToneBadge tone={m === "admin_deleted" ? "danger" : m === "legacy_hidden" ? "neutral" : "warning"}>
          {MODERATION_STATE_LABELS[m] ?? m}
        </AdminToneBadge>
      ) : null}
      {o !== "none" ? <AdminToneBadge tone="neutral">{OWNER_STATE_LABELS[o] ?? o}</AdminToneBadge> : null}
    </span>
  );
}

/** 회원 — 거래 워크스페이스의 판매자·구매자 상세로 (다른 관리 영역으로 나가지 않음) */
export function TradeMemberCell({
  userId,
  label,
  returnTo,
}: {
  userId: string | null | undefined;
  label: string | null | undefined;
  returnTo?: string;
}) {
  if (!userId) return <span className="text-sam-muted">—</span>;
  const href = `/admin/trade/members/${encodeURIComponent(userId)}`;
  return (
    <Link href={returnTo ? withAdminReturnTo(href, returnTo) : href} className="font-medium text-sky-800 hover:underline">
      {label?.trim() || "이름 없음"}
    </Link>
  );
}

export function formatTradePrice(price: unknown, freeShare?: unknown): string {
  if (freeShare === true) return "나눔";
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return "—";
  return `₱${n.toLocaleString()}`;
}

export function formatTradePoints(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString()} P`;
}

/** 서버 오류 코드 → 운영자 문구 (개발 용어 노출 금지) */
const TRADE_ERROR_KO: Record<string, string> = {
  reason_required: "사유를 2자 이상 입력해 주세요.",
  stale_state: "다른 관리자가 먼저 변경했습니다. 새로고침 후 다시 확인해 주세요.",
  already_processed: "이미 처리된 건입니다.",
  not_found: "대상을 찾을 수 없습니다.",
  forbidden_permission: "권한이 없습니다.",
  need_sold_buyer: "구매자를 선택해 주세요.",
  fault_required: "종료 사유의 책임 구분을 선택해 주세요.",
  insufficient_balance: "회원 포인트가 부족합니다.",
  category_in_use: "글이나 하위 카테고리가 있어 삭제할 수 없습니다.",
  server_error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};
export function tradeErrorText(code: string | null | undefined): string {
  const c = String(code ?? "");
  return TRADE_ERROR_KO[c] ?? `처리하지 못했습니다 (${c || "오류"})`;
}

export function tradeDetailHref(href: string, returnTo: string): string {
  return withAdminReturnTo(href, returnTo);
}
