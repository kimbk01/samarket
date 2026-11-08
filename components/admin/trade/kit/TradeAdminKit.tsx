"use client";

/**
 * 거래 Admin 화면 공통 부품 (설계 v2 §D). 목록·필터·탭·페이지네이션·조치 시트는 커뮤니티 Admin 키트를 그대로 쓴다
 * (`@/components/admin/community/kit/CommunityAdminKit` — 같은 UI/UX/CTA SSOT). 여기에는 거래 고유 부품만 둔다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  CommunityFilterField,
  type CommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { communityAdminListPeriodParams } from "@/lib/admin/community-admin/community-admin-period";
import { imageSanitizeViewerMediaUrl } from "@/lib/image/image-url";
import { loadTradeFeedThumbnailFetchUrl } from "@/lib/image/image-loader";
import {
  MODERATION_STATE_LABEL_KEYS,
  OWNER_STATE_LABEL_KEYS,
  SELLER_STAGE_LABEL_KEYS,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

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
  const { t } = useI18n();
  const v = String(value ?? "");
  const stageKey = SELLER_STAGE_LABEL_KEYS[v];
  return <AdminToneBadge tone={STAGE_TONE[v] ?? "neutral"}>{stageKey ? t(stageKey) : "—"}</AdminToneBadge>;
}

/** 노출 상태 — 관리자 노출과 판매자 노출을 따로 보여 준다 (섞지 않음) */
export function TradeVisibilityBadges({
  moderationState,
  ownerState,
}: {
  moderationState: string | null | undefined;
  ownerState: string | null | undefined;
}) {
  const { t } = useI18n();
  const m = String(moderationState ?? "visible");
  const o = String(ownerState ?? "none");
  if (m === "visible" && o === "none") return <AdminToneBadge tone="success">{t("admin_trade_kit_visible")}</AdminToneBadge>;
  return (
    <span className="flex flex-wrap gap-1">
      {m !== "visible" ? (
        <AdminToneBadge tone={m === "admin_deleted" ? "danger" : "warning"}>
          {MODERATION_STATE_LABEL_KEYS[m] ? t(MODERATION_STATE_LABEL_KEYS[m]) : m}
        </AdminToneBadge>
      ) : null}
      {o !== "none" ? <AdminToneBadge tone="neutral">{OWNER_STATE_LABEL_KEYS[o] ? t(OWNER_STATE_LABEL_KEYS[o]) : o}</AdminToneBadge> : null}
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
  const { t } = useI18n();
  if (!userId) return <span className="text-sam-muted">—</span>;
  const href = `/admin/trade/members/${encodeURIComponent(userId)}`;
  return (
    <Link href={returnTo ? withAdminReturnTo(href, returnTo) : href} className="font-medium text-sam-primary hover:underline">
      {label?.trim() || t("admin_trade_kit_no_name")}
    </Link>
  );
}

export function formatTradePrice(price: unknown, freeShare?: unknown): string {
  if (freeShare === true) return translate(getRuntimeAppLanguage(), "admin_trade_kit_free_share");
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return "—";
  return formatAdminPhp(n);
}

export function formatTradePoints(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${formatAdminNumber(v)} P`;
}

/** 서버 오류 코드 → 운영자 문구 키 (개발 용어 노출 금지) — 언어 SSOT B4: 문구는 카탈로그 `admin_trade_err_*` */
const TRADE_ERROR_KEYS: Record<string, MessageKey> = {
  reason_required: "admin_trade_err_reason_required",
  stale_state: "admin_trade_err_stale_state",
  already_processed: "admin_trade_err_already_processed",
  already_admin_hidden: "admin_trade_err_already_admin_hidden",
  already_admin_deleted: "admin_trade_err_already_admin_deleted",
  already_visible: "admin_trade_err_already_visible",
  listing_paused: "admin_trade_err_listing_paused",
  listing_unavailable: "admin_trade_err_listing_unavailable",
  not_found: "admin_trade_err_not_found",
  forbidden_permission: "admin_trade_err_forbidden_permission",
  need_sold_buyer: "admin_trade_err_need_sold_buyer",
  fault_required: "admin_trade_err_fault_required",
  insufficient_balance: "admin_trade_err_insufficient_balance",
  category_in_use: "admin_trade_err_category_in_use",
};
export function tradeErrorText(code: string | null | undefined): string {
  const c = String(code ?? "");
  const lang = getRuntimeAppLanguage();
  const key = TRADE_ERROR_KEYS[c];
  return key ? translate(lang, key) : adminOperatorErrorMessage(c, lang === "ko");
}

export function tradeDetailHref(href: string, returnTo: string): string {
  return withAdminReturnTo(href, returnTo);
}

/* ───────── R7 목록 — 기본 기간이 있는 목록 (운영 기록·포인트 내역 = 최근 30일) ───────── */

/**
 * 거래 목록 API 파라미터 — `lq.apiParams` + 기간. 날짜(from/to)·옛 프리셋(today/7d/30d)이 없으면
 * URL `period=all` 은 전체 기간, 그 외 `defaultPeriod`(기존 화면 기본값 그대로).
 */
export function tradeListApiParams<E extends string>(
  lq: CommunityListQuery<E>,
  opts: { statusKey?: string; qKey?: string; omit?: readonly string[]; defaultPeriod?: "30d" | "all"; period?: boolean } = {}
): URLSearchParams {
  const out = lq.apiParams({ statusKey: opts.statusKey, qKey: opts.qKey, omit: opts.omit, period: false });
  if (opts.period === false) return out;
  const { from, to } = lq.query;
  const raw = String(lq.query.extras["period" as E | "period"] ?? "").trim();
  const p =
    from || to || lq.legacyPeriod
      ? communityAdminListPeriodParams({ period: lq.legacyPeriod, from, to })
      : { period: raw === "all" ? "all" : opts.defaultPeriod ?? "all" };
  out.set("period", p.period);
  if ("from" in p && p.from) out.set("from", p.from);
  if ("to" in p && p.to) out.set("to", p.to);
  return out;
}

/**
 * 실제 적용 기간 글자 — `tradeListApiParams` 결과에서 (빈 목록 문구 등 · D-15).
 * all = 「전체 기간」, 프리셋 = 이름, custom = 「YYYY-MM-DD ~ YYYY-MM-DD」(PHT 날짜).
 */
export function tradeListPeriodText(params: URLSearchParams): string {
  const period = params.get("period") ?? "all";
  const lang = getRuntimeAppLanguage();
  if (period === "today") return translate(lang, "admin_trade_kit_period_today");
  if (period === "7d") return translate(lang, "admin_trade_kit_period_7d");
  if (period === "30d") return translate(lang, "admin_trade_kit_period_30d");
  if (period === "custom") {
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? from;
    return from === to ? from : `${from} ~ ${to}`;
  }
  return translate(lang, "admin_trade_kit_period_all");
}

/**
 * 기본 기간 안내 (필터 바 안) — 날짜를 고르지 않았을 때 「최근 30일 (기본)」 [전체 기간] / 「전체 기간」 [최근 30일로].
 * 날짜나 옛 프리셋이 걸려 있으면 표시하지 않는다 (필터 바가 직접 보여 준다).
 */
export function TradeDefaultPeriodField<E extends string>({ lq }: { lq: CommunityListQuery<E> }) {
  const { t } = useI18n();
  if (lq.query.from || lq.query.to || lq.legacyPeriod) return null;
  const all = String(lq.query.extras["period" as E | "period"] ?? "").trim() === "all";
  return (
    <CommunityFilterField label={t("admin_trade_kit_period_pht")}>
      <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
        {all ? t("admin_trade_kit_period_all") : t("admin_trade_kit_period_30d_default")}
        <AdminActionButton
          variant="quiet"
          size="sm"
          className="h-auto! px-1!"
          onClick={() => lq.patch({ extras: { period: all ? "" : "all" } as Partial<Record<E | "period", string>> })}
        >
          {all ? t("admin_trade_kit_period_to_30d") : t("admin_trade_kit_period_show_all")}
        </AdminActionButton>
      </span>
    </CommunityFilterField>
  );
}
