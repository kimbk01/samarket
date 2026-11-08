"use client";

/**
 * 거래 게시물 상세 `/admin/products/[id]` (설계 v2 §C-3 · §F-1).
 * ① 요약(사진·판매 단계·노출·판매자·구매자) → ② 조치(수정·노출 조치·판매 단계 정정·판매 취소·강제 완료)
 * → ③ 탭(수정 이력·신고·거래 채팅·홍보·조치 기록). 모든 조치는 사유 필수, 끝나면 다시 불러온다.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  CommunityActionSheet,
  CommunitySummaryCard,
  CommunityTabs,
  CommunityTimeCell,
  CommunityTimeline,
  type CommunitySheetResult,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  TradeMemberCell,
  TradePostThumb,
  TradeStageBadge,
  TradeVisibilityBadges,
  formatTradePoints,
  formatTradePrice,
  tradeErrorText,
} from "@/components/admin/trade/kit/TradeAdminKit";
import { useTradeCategoryOptions } from "@/components/admin/trade/posts/TradePostsPage";
import {
  MODERATION_STATE_LABEL_KEYS,
  SELLER_STAGE_LABEL_KEYS,
  TRADE_POST_MODERATION_ACTION_LABEL_KEYS,
  allowedTradePostModerationActions,
  type TradePostModerationAction,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { ADMIN_DASHBOARD_REPORT_REASON_LABEL_KEYS } from "@/lib/admin-dashboard/report-reason-labels";
import { imageSanitizeViewerMediaUrl } from "@/lib/image/image-url";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { tradePromotionListingReasonLabel } from "@/lib/admin/trade-admin/trade-promotion-labels";
import { isTradeBoostOrderOngoing } from "@/lib/promotion/trade-boost-order-state";

const LIST_PATH = "/admin/posts-management";
const FIELD =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-60";
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type Post = {
  id: string;
  user_id: string | null;
  title: string | null;
  content: string | null;
  price: number | null;
  is_free_share: boolean | null;
  is_price_offer: boolean | null;
  images: unknown;
  thumbnail_url: string | null;
  status: string | null;
  seller_listing_state: string | null;
  moderation_state: string | null;
  owner_state: string | null;
  moderation_reason: string | null;
  moderation_at: string | null;
  moderation_by_label: string | null;
  trade_category_id: string | null;
  category_name: string | null;
  trade_type: string | null;
  region_label: string | null;
  view_count: number | null;
  favorite_count: number | null;
  chat_count: number | null;
  sold_buyer_id: string | null;
  sold_buyer_label: string | null;
  reserved_buyer_id: string | null;
  reserved_buyer_label: string | null;
  seller_label: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};
type Revision = {
  id: string;
  editor_label: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};
type Audit = {
  id: string;
  actor_label: string | null;
  action: string;
  after_json: Record<string, unknown> | null;
  created_at: string;
};
type Report = {
  id: string;
  reporter_id: string | null;
  reporter_label: string | null;
  reason_code: string | null;
  reason_text: string | null;
  is_open: boolean;
  created_at: string;
  resolved_at: string | null;
};
type Promotion = {
  id: string;
  order_status: string | null;
  point_cost: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  /** 글 상태 연동 이유 (재감사 B-5③) */
  paused_by?: string | null;
  end_reason_code?: string | null;
};
type Room = {
  id: string;
  buyer_id: string | null;
  buyer_label: string | null;
  trade_status: string | null;
  last_message_at: string | null;
  created_at: string;
};
type DetailResponse = {
  ok?: boolean;
  error?: string;
  post?: Post;
  revisions?: Revision[];
  audits?: Audit[];
  reports?: Report[];
  promotions?: Promotion[];
  rooms?: Room[];
};

type Sheet =
  | { kind: "edit" }
  | { kind: "moderation"; action: TradePostModerationAction }
  | { kind: "stage" }
  | { kind: "cancel_sale" }
  | { kind: "force_complete" }
  | null;
type DetailTab = "revisions" | "reports" | "rooms" | "promotions" | "audits";
type Notice = { tone: "warn"; text: string } | null;

const AUDIT_ACTION_KO: Record<string, MessageKey> = {
  "trade_post.hide": "admin_trade_pd_act_hide",
  "trade_post.unhide": "admin_trade_pd_act_unhide",
  "trade_post.delete": "admin_trade_pd_act_delete",
  "trade_post.undelete": "admin_trade_pd_act_undelete",
  "trade_post.confirm_admin_hidden": "admin_trade_audit_act_post_confirm_hidden",
  "trade_post.edit": "admin_trade_post_detail_edit_content",
  "trade_post.sale_stage_active": "admin_trade_pd_act_stage_active",
  "trade_post.sale_stage_reserved": "admin_trade_pd_act_stage_reserved",
  "trade_post.sale_stage_sold": "admin_trade_pd_act_stage_sold",
  "trade_post.cancel_sale": "admin_trade_post_detail_cancel_sale",
  "trade_post.force_complete": "admin_trade_pd_act_force_complete",
};

const PROMOTION_STATUS_KO: Record<string, MessageKey> = {
  pending_review: "admin_trade_pd_promo_pending",
  active: "admin_trade_restrict_badge_active",
  paused: "admin_trade_promo_st_paused",
  ended: "admin_trade_promo_st_ended",
  expired: "admin_trade_promo_st_expired",
  rejected: "admin_trade_promo_st_rejected",
  cancelled: "admin_trade_promo_st_cancelled",
};

const EXTRA_ERROR_KEYS: Record<string, MessageKey> = {
  title_required: "admin_trade_post_detail_err_title_required",
  invalid_category: "admin_trade_post_detail_err_invalid_category",
  invalid_images: "admin_trade_post_detail_err_invalid_images",
  empty_patch: "admin_trade_post_detail_err_empty_patch",
  invalid_action: "admin_trade_post_detail_err_invalid_action",
};

function errorTextOf(code: string, status: number): string {
  const extra = EXTRA_ERROR_KEYS[code];
  if (extra) return translate(getRuntimeAppLanguage(), extra);
  if (/[가-힣]/.test(code)) return code;
  if (status >= 500 || status === 0) return tradeErrorText("server_error");
  return tradeErrorText(code);
}

/** 조치 요청 — 시트 결과(오류 문구는 운영자 문구로) + 응답 JSON (경고 플래그·오류 코드) */
async function tradeActionFetch(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>
): Promise<{ result: CommunitySheetResult; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok !== false) return { result: { ok: true }, json };
    const raw = String(json.code ?? json.error ?? `http_${res.status}`);
    /** D-6: 「이미 {상태}」는 운영자 문구로 바로 보여 준다(새로고침 안내 대신) */
    const alreadyInState = raw === "already_admin_hidden" || raw === "already_admin_deleted" || raw === "already_visible";
    const keep =
      !alreadyInState && (res.status === 403 || res.status === 404 || res.status === 409 || raw === "stale_state");
    return { result: { ok: false, status: res.status, code: keep ? raw : errorTextOf(raw, res.status) }, json };
  } catch {
    return { result: { ok: false, status: 0, code: tradeErrorText("server_error") }, json: {} };
  }
}

function warningsOf(t: Translate, json: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (json.sideEffectWarning) out.push(t("admin_trade_pd_warn_notify_failed"));
  if (json.auditWarning) out.push(t("admin_trade_pd_warn_audit_failed"));
  return out;
}

function pht(iso: string | null | undefined): string {
  return iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—";
}

function imagesOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((x) => String(x ?? "")).filter(Boolean) : [];
}

function stageGroup(stage: string | null | undefined): "active" | "reserved" | "sold" {
  if (stage === "completed") return "sold";
  if (stage === "reserved") return "reserved";
  return "active";
}

function shortMember(t: Translate, id: string): string {
  return t("admin_trade_pd_member_short", { id: formatAdminShortId(id) });
}

/* ───────── 사진 ───────── */

function TradeImageGallery({ images, size = 112 }: { images: string[]; size?: number }) {
  const { t } = useI18n();
  if (images.length === 0) return <p className="text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_photos")}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {images.map((u, i) => {
        const href = imageSanitizeViewerMediaUrl(u);
        const thumb = <TradePostThumb post={{ images: [u] }} size={size} />;
        return (
          <li key={`${u}-${i}`} className="relative">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" title={t("admin_trade_post_detail_view_original")}>
                {thumb}
              </a>
            ) : (
              thumb
            )}
            {i === 0 ? (
              <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-fg/80 px-1.5 py-0.5 text-[12px] font-semibold text-sam-surface">
                {t("admin_trade_post_cover_badge")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────── 메인 ───────── */

export function TradePostDetailPage({ postId }: { postId: string }) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const id = postId.trim();
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? LIST_PATH;
  const selfHref = useMemo(() => {
    const qs = sp.toString();
    return `/admin/products/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  }, [id, sp]);

  const { state, reload } = useCommunityAdminJson<DetailResponse>(id ? `/api/admin/trade/posts/${encodeURIComponent(id)}` : null);
  const data = state.data;
  const post = data?.post ?? null;
  const categories = useTradeCategoryOptions();

  const [banner, setBanner] = useState<{ ok: true; message: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [tab, setTab] = useState<DetailTab>("revisions");
  const lastJson = useRef<Record<string, unknown>>({});

  // 수정 폼
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eContent, setEContent] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eFree, setEFree] = useState(false);
  const [eOffer, setEOffer] = useState(false);
  const [eCategory, setECategory] = useState("");
  const [eImages, setEImages] = useState<string[]>([]);

  // 판매 단계 정정 · 강제 완료 입력
  const [stage, setStage] = useState<"active" | "reserved" | "sold">("active");
  const [buyerId, setBuyerId] = useState("");
  const [needBuyer, setNeedBuyer] = useState(false);
  const [buyers, setBuyers] = useState<string[] | null>(null);

  const resetForm = (p: Post) => {
    setETitle(String(p.title ?? ""));
    setEContent(String(p.content ?? ""));
    setEPrice(p.price == null ? "" : String(p.price));
    setEFree(p.is_free_share === true);
    setEOffer(p.is_price_offer === true);
    setECategory(String(p.trade_category_id ?? ""));
    setEImages(imagesOf(p.images));
  };

  const patch = useMemo(() => {
    if (!post) return {};
    const out: Record<string, unknown> = {};
    if (eTitle.trim() !== String(post.title ?? "").trim()) out.title = eTitle.trim();
    if (eContent !== String(post.content ?? "")) out.content = eContent;
    const priceNow = post.price == null ? "" : String(post.price);
    if (ePrice.trim() !== priceNow) out.price = ePrice.trim() === "" ? null : Number(ePrice);
    if (eFree !== (post.is_free_share === true)) out.is_free_share = eFree;
    if (eOffer !== (post.is_price_offer === true)) out.is_price_offer = eOffer;
    if (eCategory && eCategory !== String(post.trade_category_id ?? "")) out.trade_category_id = eCategory;
    if (JSON.stringify(eImages) !== JSON.stringify(imagesOf(post.images))) out.images = eImages;
    return out;
  }, [post, eTitle, eContent, ePrice, eFree, eOffer, eCategory, eImages]);
  const dirty = Object.keys(patch).length > 0;
  const editValid = eTitle.trim().length > 0 && (ePrice.trim() === "" || Number.isFinite(Number(ePrice)));

  // 구매자 후보 — 거래완료 정정·강제 완료 시트에서만 불러온다
  const buyerSheetOpen = (sheet?.kind === "stage" && stage === "sold") || sheet?.kind === "force_complete";
  useEffect(() => {
    if (!buyerSheetOpen || buyers !== null || !id) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/buyers`, { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; uniqueBuyerIds?: string[] };
        if (alive) setBuyers(res.ok && Array.isArray(json.uniqueBuyerIds) ? json.uniqueBuyerIds : []);
      } catch {
        if (alive) setBuyers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [buyerSheetOpen, buyers, id]);

  const buyerLabelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.rooms ?? []) if (r.buyer_id && r.buyer_label) m.set(r.buyer_id, r.buyer_label);
    if (post?.reserved_buyer_id && post.reserved_buyer_label) m.set(post.reserved_buyer_id, post.reserved_buyer_label);
    if (post?.sold_buyer_id && post.sold_buyer_label) m.set(post.sold_buyer_id, post.sold_buyer_label);
    return (bid: string) => m.get(bid) ?? shortMember(t, bid);
  }, [data?.rooms, post, t]);

  const openSheet = (s: Sheet) => {
    setBuyerId("");
    setNeedBuyer(false);
    setBuyers(null);
    if (s?.kind === "stage" && post) {
      const cur = stageGroup(post.seller_listing_state);
      setStage(cur === "active" ? "reserved" : "active");
    }
    setSheet(s);
  };

  const onSettled = (kind: CommunitySheetSettle, okMessage: string, opts: { closeEdit?: boolean } = {}) => {
    const json = lastJson.current;
    setSheet(null);
    if (kind === "done") {
      setBanner({ ok: true, message: okMessage });
      setNotice(null);
      setWarnings(warningsOf(t, json));
      if (opts.closeEdit) setEditing(false);
    } else if (kind === "stale") {
      setBanner(null);
      setNotice({ tone: "warn", text: t("admin_trade_pd_stale") });
      setEditing(false);
    } else {
      setBanner(null);
      setNotice({ tone: "warn", text: t("admin_trade_pd_gone") });
    }
    reload();
  };

  const run = async (url: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
    const { result, json } = await tradeActionFetch(url, method, body);
    lastJson.current = json;
    return { result, json };
  };

  if (!id) return <AdminEmptyState ko={ko} message={t("admin_trade_pd_not_found")} />;
  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <BackLink href={backHref} />
        <AdminErrorState ko={ko} code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      </div>
    );
  }
  if (!post) {
    return (
      <div className="space-y-3">
        <BackLink href={backHref} />
        <AdminLoadingState ko={ko} />
      </div>
    );
  }

  const images = imagesOf(post.images);
  const modState = String(post.moderation_state ?? "visible");
  const stageNow = stageGroup(post.seller_listing_state);
  const modActions = allowedTradePostModerationActions(modState);
  const promotionRunning = (data?.promotions ?? []).some((p) =>
    isTradeBoostOrderOngoing({ orderStatus: p.order_status, startAt: p.start_at, endAt: p.end_at })
  );
  const canCancelSale = post.seller_listing_state === "reserved" || post.seller_listing_state === "completed" || post.seller_listing_state === "negotiating";
  const canForceComplete = post.seller_listing_state !== "completed";
  const expected = post.updated_at ?? undefined;
  const postApi = `/api/admin/trade/posts/${encodeURIComponent(id)}`;
  const legacyApi = `/api/admin/posts/${encodeURIComponent(id)}`;
  const busy = state.status === "loading";
  const reasonCfg = { minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: t("admin_trade_pd_reason_ph") };

  const summaryRows: { label: string; value: ReactNode }[] = [
    {
      label: t("admin_trade_member_th_price"),
      value: formatTradePrice(post.price, post.is_free_share) + (post.is_price_offer ? ` · ${t("admin_trade_pd_price_offer_on")}` : ""),
    },
    { label: t("admin_trade_posts_th_stage"), value: <TradeStageBadge value={post.seller_listing_state} /> },
    { label: t("admin_trade_posts_th_visibility"), value: <TradeVisibilityBadges moderationState={post.moderation_state} ownerState={post.owner_state} /> },
    { label: t("admin_trade_th_seller"), value: <TradeMemberCell userId={post.user_id} label={post.seller_label} returnTo={selfHref} /> },
    { label: t("admin_trade_points_th_type"), value: post.trade_type === "job" ? t("admin_trade_posts_job_badge") : t("admin_trade_posts_type_product") },
    { label: t("common_region"), value: post.region_label ?? "—" },
    { label: t("admin_trade_audit_target_category"), value: post.category_name ?? "—" },
    { label: t("admin_trade_pd_views_favs_chats"), value: `${post.view_count ?? 0} · ${post.favorite_count ?? 0} · ${post.chat_count ?? 0}` },
    { label: t("admin_trade_th_created"), value: pht(post.created_at) },
    { label: t("admin_trade_posts_th_updated"), value: pht(post.updated_at) },
  ];
  if (post.reserved_buyer_id) {
    summaryRows.push({
      label: t("admin_trade_pd_reserved_buyer"),
      value: <TradeMemberCell userId={post.reserved_buyer_id} label={post.reserved_buyer_label} returnTo={selfHref} />,
    });
  }
  if (post.sold_buyer_id || post.seller_listing_state === "completed") {
    summaryRows.push({
      label: t("admin_trade_pd_sold_buyer"),
      value: post.sold_buyer_id ? (
        <TradeMemberCell userId={post.sold_buyer_id} label={post.sold_buyer_label} returnTo={selfHref} />
      ) : (
        "—"
      ),
    });
    summaryRows.push({ label: t("admin_trade_pd_completed_at"), value: post.completed_at ? pht(post.completed_at) : t("admin_trade_pd_completed_at_none") });
  }
  if (modState !== "visible") {
    summaryRows.push({ label: t("admin_trade_dash_admin_actions"), value: MODERATION_STATE_LABEL_KEYS[modState] ? t(MODERATION_STATE_LABEL_KEYS[modState]) : "—" });
    summaryRows.push({ label: t("admin_trade_pd_action_reason"), value: post.moderation_reason?.trim() || "—" });
    summaryRows.push({ label: t("admin_trade_audit_actor"), value: post.moderation_by_label ?? "—" });
    summaryRows.push({ label: t("admin_trade_pd_handled_at"), value: pht(post.moderation_at) });
  }

  const targetRows = [
    { label: t("admin_trade_audit_post"), value: post.title?.trim() || t("admin_trade_posts_no_title") },
    { label: t("admin_trade_posts_th_stage"), value: SELLER_STAGE_LABEL_KEYS[String(post.seller_listing_state ?? "")] ? t(SELLER_STAGE_LABEL_KEYS[String(post.seller_listing_state ?? "")]) : "—" },
    { label: t("admin_trade_posts_th_visibility"), value: <TradeVisibilityBadges moderationState={post.moderation_state} ownerState={post.owner_state} /> },
  ];

  const buyerPicker = (required: boolean) => (
    <label className="block">
      <span className="sam-text-helper font-medium text-sam-fg">{t(required ? "admin_trade_post_detail_buyer_required" : "admin_trade_post_detail_buyer")}</span>
      <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className={`mt-1 ${FIELD}`}>
        <option value="">{required ? t("admin_trade_pd_pick_buyer") : t("admin_trade_pd_buyer_auto")}</option>
        {(buyers ?? []).map((b) => (
          <option key={b} value={b}>
            {buyerLabelOf(b)}
          </option>
        ))}
      </select>
      {buyers === null ? <span className="mt-1 block sam-text-xxs text-sam-muted">{t("admin_trade_post_detail_buyers_loading")}</span> : null}
      {buyers !== null && buyers.length === 0 ? (
        <span className="mt-1 block sam-text-xxs text-sam-muted">{t("admin_trade_post_detail_no_buyers")}</span>
      ) : null}
    </label>
  );

  const counts: Record<DetailTab, number> = {
    revisions: data?.revisions?.length ?? 0,
    reports: data?.reports?.length ?? 0,
    rooms: data?.rooms?.length ?? 0,
    promotions: data?.promotions?.length ?? 0,
    audits: data?.audits?.length ?? 0,
  };

  return (
    <div data-trade-admin-post-detail="1" className="space-y-3">
      <BackLink href={backHref} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg [overflow-wrap:anywhere]">
            {post.title?.trim() || t("admin_trade_posts_no_title")}
          </h1>
          <p className="mt-1 sam-text-body text-sam-muted">{formatTradePrice(post.price, post.is_free_share)}</p>
        </div>
        <AdminActionButton variant="secondary" onClick={reload} disabled={busy}>
          {busy ? t("common_loading") : t("admin_trade_dash_refresh")}
        </AdminActionButton>
      </header>

      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />
      {warnings.length > 0 ? (
        <p role="alert" className="text-[12px] font-medium text-sam-warning">
          {warnings.join(" · ")}
        </p>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg">
          {notice.text}
        </div>
      ) : null}

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <TradeImageGallery images={images} />
        <CommunitySummaryCard rows={summaryRows} />
        <div className="flex flex-wrap gap-2">
          <AdminActionButton
            variant="secondary"
            disabled={editing || busy}
            onClick={() => {
              resetForm(post);
              setEditing(true);
            }}
          >
            {t("admin_trade_post_edit")}
          </AdminActionButton>
          {modState === "admin_deleted" ? (
            /** D-6: 삭제 글에는 「숨김」이 없다 — 삭제 취소가 곧 관리자 숨김으로 돌리는 것 */
            <p className="w-full text-[13px] text-sam-muted" data-trade-admin-deleted-guide="">
              {t("admin_trade_post_admin_deleted_hint")}
            </p>
          ) : null}
          {modActions.map((a) => (
            <AdminActionButton
              key={a}
              variant={a === "delete" || a === "hide" ? "danger" : "secondary"}
              disabled={busy}
              onClick={() => openSheet({ kind: "moderation", action: a })}
            >
              {t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[a])}
            </AdminActionButton>
          ))}
          <AdminActionButton variant="secondary" disabled={busy} onClick={() => openSheet({ kind: "stage" })}>
            {t("admin_trade_post_fix_sale_stage")}
          </AdminActionButton>
          {canCancelSale ? (
            <AdminActionButton variant="danger" disabled={busy} onClick={() => openSheet({ kind: "cancel_sale" })}>
              {t("admin_trade_post_cancel_sale")}
            </AdminActionButton>
          ) : null}
          {canForceComplete ? (
            <AdminActionButton variant="secondary" disabled={busy} onClick={() => openSheet({ kind: "force_complete" })}>
              {t("admin_trade_post_force_complete")}
            </AdminActionButton>
          ) : null}
        </div>
      </section>

      {editing ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <h2 className="text-[14px] font-semibold text-sam-fg">{t("admin_trade_post_detail_edit_content")}</h2>
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_trade_post_field_title")}
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} maxLength={200} className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_trade_post_field_body")}
            <textarea value={eContent} onChange={(e) => setEContent(e.target.value)} rows={8} className={`mt-1 ${FIELD}`} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_trade_post_field_price_php")}
              <input
                inputMode="numeric"
                value={ePrice}
                onChange={(e) => setEPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className={`mt-1 w-36 ${FIELD}`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-sam-fg">
              <input type="checkbox" checked={eFree} onChange={(e) => setEFree(e.target.checked)} />
              {t("admin_trade_post_field_free_share")}
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-sam-fg">
              <input type="checkbox" checked={eOffer} onChange={(e) => setEOffer(e.target.checked)} />
              {t("admin_trade_post_field_accept_offers")}
            </label>
            <label className="block min-w-[12rem] text-[12px] font-medium text-sam-muted">
              {t("admin_trade_post_field_category")}
              <select value={eCategory} onChange={(e) => setECategory(e.target.value)} className={`mt-1 ${FIELD}`}>
                {!eCategory ? <option value="">{t("admin_trade_post_detail_select_placeholder")}</option> : null}
                {eCategory && !categories.some((c) => c.id === eCategory) ? (
                  <option value={eCategory}>{post.category_name ?? t("admin_trade_pd_current_category")}</option>
                ) : null}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.active ? c.name : t("admin_trade_posts_category_inactive", { name: c.name })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="text-[12px] font-medium text-sam-muted">{t("admin_trade_post_detail_photos_count", { n: eImages.length })}</p>
            {eImages.length === 0 ? (
              <p className="mt-1 text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_photos_edit")}</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-3">
                {eImages.map((u, i) => (
                  <li key={`${u}-${i}`} className="flex flex-col items-center gap-1">
                    <span className="relative">
                      <TradePostThumb post={{ images: [u] }} size={88} />
                      {i === 0 ? (
                        <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-fg/80 px-1.5 py-0.5 text-[12px] font-semibold text-sam-surface">
                          {t("admin_trade_post_cover_badge")}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-1">
                      {i > 0 ? (
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setEImages((arr) => [arr[i]!, ...arr.filter((_, j) => j !== i)])}
                        >
                          {t("admin_trade_post_make_cover")}
                        </AdminActionButton>
                      ) : null}
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setEImages((arr) => arr.filter((_, j) => j !== i))}
                      >
                        {t("admin_trade_post_image_delete")}
                      </AdminActionButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <AdminActionButton
              variant="secondary"
              onClick={() => {
                resetForm(post);
                setEditing(false);
              }}
            >
              {t("admin_trade_post_edit_cancel")}
            </AdminActionButton>
            <AdminActionButton variant="primary" disabled={!dirty || !editValid || busy} onClick={() => openSheet({ kind: "edit" })}>
              {t("admin_trade_post_edit_save")}
            </AdminActionButton>
          </div>
        </section>
      ) : null}

      <CommunityTabs
        tabs={[
          { value: "revisions", label: t("admin_trade_pd_tab_revisions"), count: counts.revisions },
          { value: "reports", label: t("common_report"), count: counts.reports },
          { value: "rooms", label: t("admin_trade_audit_target_chat"), count: counts.rooms },
          { value: "promotions", label: t("admin_trade_audit_target_promotion"), count: counts.promotions },
          { value: "audits", label: t("admin_trade_pd_tab_audits"), count: counts.audits },
        ]}
        value={tab}
        onChange={(v) => setTab(v as DetailTab)}
      />
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        {tab === "revisions" ? (
          <RevisionsTab revisions={data?.revisions ?? []} categoryName={(cid) => categories.find((c) => c.id === cid)?.name ?? null} />
        ) : tab === "reports" ? (
          <ReportsTab postId={id} reports={data?.reports ?? []} selfHref={selfHref} />
        ) : tab === "rooms" ? (
          <RoomsTab postId={id} rooms={data?.rooms ?? []} selfHref={selfHref} />
        ) : tab === "promotions" ? (
          <PromotionsTab postId={id} promotions={data?.promotions ?? []} />
        ) : (
          <CommunityTimeline
            items={(data?.audits ?? []).map((a) => ({
              id: a.id,
              at: a.created_at,
              actor: a.actor_label ?? "—",
              action: t(AUDIT_ACTION_KO[a.action] ?? "admin_trade_pd_act_other"),
              reason: typeof a.after_json?.reason === "string" ? a.after_json.reason : null,
            }))}
          />
        )}
      </section>

      {/* ───── 시트 ───── */}
      {sheet?.kind === "edit" ? (
        <CommunityActionSheet
          title={t("admin_trade_post_detail_save_edit")}
          rows={[
            ...targetRows.slice(0, 1),
            { label: t("admin_trade_pd_changed_fields"), value: Object.keys(patch).map((k) => (FIELD_LABEL[k] ? t(FIELD_LABEL[k]) : k)).join(", ") || "—" },
          ]}
          notice={t("admin_trade_pd_edit_notice")}
          reason={reasonCfg}
          ready={dirty && editValid}
          confirmLabel={t("common_save")}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => (await run(postApi, "PATCH", { patch, reason, expectedUpdatedAt: expected })).result}
          onSettled={(k) => onSettled(k, t("admin_trade_pd_edit_saved"), { closeEdit: true })}
        />
      ) : null}

      {sheet?.kind === "moderation" ? (
        <CommunityActionSheet
          title={t("admin_trade_posts_sheet_title", { action: t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action]) })}
          rows={targetRows}
          notice={
            /** D-7: 진행 중(노출·일시정지·심사 중) 상위노출이 있으면 삭제 = 광고 종료·환급 없음(트리거 `listing_admin_deleted`) */
            sheet.action === "delete" && promotionRunning
              ? `${t(MODERATION_NOTICE.delete)} ${t("admin_trade_pd_delete_promo_notice")}`
              : t(MODERATION_NOTICE[sheet.action])
          }
          reason={reasonCfg}
          destructive={sheet.action === "delete" || sheet.action === "hide"}
          confirmLabel={t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action])}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) =>
            (await run(`${postApi}/moderation`, "POST", { action: sheet.action, reason, expectedUpdatedAt: expected })).result
          }
          onSettled={(k) => onSettled(k, t("admin_trade_reports_decided", { action: t(TRADE_POST_MODERATION_ACTION_LABEL_KEYS[sheet.action]) }))}
        />
      ) : null}

      {sheet?.kind === "stage" ? (
        <CommunityActionSheet
          title={t("admin_trade_post_detail_fix_stage")}
          rows={targetRows}
          notice={t("admin_trade_pd_stage_notice")}
          reason={reasonCfg}
          ready={stage !== stageNow && (!needBuyer || stage !== "sold" || Boolean(buyerId))}
          confirmLabel={t("admin_trade_pd_fix_btn")}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const body: Record<string, unknown> = { status: stage, reason };
            if (stage === "sold" && buyerId) body.soldBuyerId = buyerId;
            const { result, json } = await run(`${legacyApi}/status`, "POST", body);
            if (!result.ok && json.code === "need_sold_buyer") setNeedBuyer(true);
            return result;
          }}
          onSettled={(k) => onSettled(k, t("admin_trade_pd_stage_fixed"))}
        >
          <fieldset className="space-y-1">
            <legend className="sam-text-helper font-medium text-sam-fg">{t("admin_trade_post_detail_new_stage")}</legend>
            {(
              [
                ["active", "admin_trade_regions_th_selling"],
                ["reserved", "admin_trade_regions_th_reserved"],
                ["sold", "admin_trade_regions_th_sold"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-[13px] text-sam-fg">
                <input
                  type="radio"
                  name="trade-stage"
                  checked={stage === v}
                  disabled={v === stageNow}
                  onChange={() => setStage(v)}
                />
                {t(l)}
                {v === stageNow ? <span className="text-sam-muted">{t("admin_trade_post_detail_current_mark")}</span> : null}
              </label>
            ))}
          </fieldset>
          {stage === "sold" ? buyerPicker(needBuyer) : null}
        </CommunityActionSheet>
      ) : null}

      {sheet?.kind === "cancel_sale" ? (
        <CommunityActionSheet
          title={t("admin_trade_post_detail_cancel_sale")}
          rows={targetRows}
          notice={
            modState === "visible"
              ? t("admin_trade_pd_cancel_notice_hide")
              : t("admin_trade_pd_cancel_notice")
          }
          reason={reasonCfg}
          destructive
          confirmLabel={t("admin_trade_post_detail_cancel_sale")}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => (await run(`${legacyApi}/trade-override`, "POST", { action: "cancel_sale", reason })).result}
          onSettled={(k) => onSettled(k, t("admin_trade_pd_sale_cancelled"))}
        />
      ) : null}

      {sheet?.kind === "force_complete" ? (
        <CommunityActionSheet
          title={t("admin_trade_post_detail_force_complete")}
          rows={targetRows}
          notice={t("admin_trade_pd_force_notice")}
          reason={reasonCfg}
          ready={!needBuyer || Boolean(buyerId)}
          confirmLabel={t("admin_trade_post_detail_force_complete")}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const body: Record<string, unknown> = { action: "force_complete", reason };
            if (buyerId) body.buyerId = buyerId;
            const { result, json } = await run(`${legacyApi}/trade-override`, "POST", body);
            if (!result.ok && json.code === "need_sold_buyer") setNeedBuyer(true);
            return result;
          }}
          onSettled={(k) => onSettled(k, t("admin_trade_pd_force_done"))}
        >
          {buyerPicker(needBuyer)}
        </CommunityActionSheet>
      ) : null}
    </div>
  );
}

const MODERATION_NOTICE: Record<TradePostModerationAction, MessageKey> = {
  hide: "admin_trade_pd_notice_hide",
  unhide: "admin_trade_pd_notice_unhide",
  delete: "admin_trade_pd_notice_delete",
  undelete: "admin_trade_pd_notice_undelete",
};

const FIELD_LABEL: Record<string, MessageKey> = {
  title: "admin_trade_member_th_title",
  content: "admin_trade_pd_field_content",
  price: "admin_trade_member_th_price",
  trade_category_id: "admin_trade_audit_target_category",
  images: "admin_trade_pd_field_images",
  thumbnail_url: "admin_trade_pd_field_thumbnail",
  is_price_offer: "admin_trade_pd_field_price_offer",
  is_free_share: "admin_trade_kit_free_share",
};

function BackLink({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="inline-block text-[13px] font-medium text-sam-muted hover:text-sam-fg">
      {t("admin_trade_back_to_list")}
    </Link>
  );
}

/* ───────── 탭 ───────── */

function fieldValueText(t: Translate, key: string, v: unknown, categoryName: (id: string) => string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "is_price_offer" || key === "is_free_share") return v === true ? t("admin_trade_pd_yes") : t("admin_trade_pd_no");
  if (key === "price") return formatTradePrice(v);
  if (key === "trade_category_id") return categoryName(String(v)) ?? t("admin_trade_pd_other_category");
  if (key === "images") return t("admin_trade_pd_photo_count", { n: Array.isArray(v) ? v.length : 0 });
  if (key === "thumbnail_url") return t("admin_trade_pd_field_images");
  const s = String(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

function RevisionsTab({ revisions, categoryName }: { revisions: Revision[]; categoryName: (id: string) => string | null }) {
  const { t } = useI18n();
  if (revisions.length === 0) return <p className="text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_revisions")}</p>;
  return (
    <ol className="space-y-2">
      {revisions.map((r) => {
        const before = r.before_json ?? {};
        const after = r.after_json ?? {};
        const keys = Object.keys(FIELD_LABEL).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
        return (
          <li key={r.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-2 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sam-fg">{keys.map((k) => t(FIELD_LABEL[k])).join(", ") || t("admin_trade_post_detail_no_changes")}</span>
              <span className="text-sam-muted">
                {pht(r.created_at)} · {r.editor_label ?? "—"}
              </span>
            </div>
            {r.reason ? <p className="mt-1 whitespace-pre-wrap text-sam-muted">{t("admin_trade_post_detail_reason", { reason: r.reason })}</p> : null}
            {keys.length > 0 ? (
              <dl className="mt-2 space-y-1">
                {keys.map((k) => {
                  const imgsChanged = k === "images";
                  const sameCount =
                    imgsChanged &&
                    Array.isArray(before[k]) &&
                    Array.isArray(after[k]) &&
                    (before[k] as unknown[]).length === (after[k] as unknown[]).length;
                  return (
                    <div key={k} className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt className="text-sam-muted">{t(FIELD_LABEL[k])}</dt>
                      <dd className="min-w-0 [overflow-wrap:anywhere]">
                        {k === "thumbnail_url" ? (
                          t("admin_trade_pd_thumb_changed")
                        ) : sameCount ? (
                          t("admin_trade_pd_photo_order_changed")
                        ) : (
                          <>
                            <span className="whitespace-pre-wrap text-sam-muted line-through">
                              {fieldValueText(t, k, before[k], categoryName)}
                            </span>
                            <span className="mx-1 text-sam-muted">→</span>
                            <span className="whitespace-pre-wrap text-sam-fg">{fieldValueText(t, k, after[k], categoryName)}</span>
                          </>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReportsTab({ postId, reports, selfHref }: { postId: string; reports: Report[]; selfHref: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/trade/reports?targetId=${encodeURIComponent(postId)}`} variant="secondary">
          {t("admin_trade_post_view_in_reports")}
        </AdminActionLink>
      </div>
      {reports.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_reports")}</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-2 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AdminToneBadge tone={r.is_open ? "warning" : "neutral"}>{r.is_open ? t("admin_trade_reports_st_pending") : t("admin_trade_reports_st_done")}</AdminToneBadge>
                  <span className="font-medium text-sam-fg">
                    {t(ADMIN_DASHBOARD_REPORT_REASON_LABEL_KEYS[String(r.reason_code ?? "")] ?? "admin_trade_audit_target_other")}
                  </span>
                </span>
                <span className="text-sam-muted">
                  <CommunityTimeCell iso={r.created_at} /> ·{" "}
                  <TradeMemberCell userId={r.reporter_id} label={r.reporter_label} returnTo={selfHref} />
                </span>
              </div>
              {r.reason_text ? <p className="mt-1 whitespace-pre-wrap text-sam-muted">{r.reason_text}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomsTab({ postId, rooms, selfHref }: { postId: string; rooms: Room[]; selfHref: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/chats?type=trade&postId=${encodeURIComponent(postId)}`} variant="secondary">
          {t("admin_trade_post_view_in_chats")}
        </AdminActionLink>
      </div>
      {rooms.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_rooms")}</p>
      ) : (
        <ul className="divide-y divide-sam-border-soft text-[13px]">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <TradeMemberCell userId={r.buyer_id} label={r.buyer_label} returnTo={selfHref} />
                <TradeStageBadge value={r.trade_status} />
              </span>
              <span className="text-sam-muted">
                {t("admin_trade_post_last_message")} <CommunityTimeCell iso={r.last_message_at ?? r.created_at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromotionsTab({ postId, promotions }: { postId: string; promotions: Promotion[] }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/trade/promotions?postId=${encodeURIComponent(postId)}`} variant="secondary">
          {t("admin_trade_post_view_in_promotions")}
        </AdminActionLink>
      </div>
      {promotions.length === 0 ? (
        <p className="text-[13px] text-sam-muted">{t("admin_trade_post_detail_no_promotions")}</p>
      ) : (
        <ul className="divide-y divide-sam-border-soft text-[13px]">
          {promotions.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <AdminToneBadge tone={p.order_status === "active" ? "success" : "neutral"}>
                  {t(PROMOTION_STATUS_KO[String(p.order_status ?? "")] ?? "admin_trade_audit_target_other")}
                </AdminToneBadge>
                <span className="text-sam-fg">{formatTradePoints(p.point_cost)}</span>
                {tradePromotionListingReasonLabel(p, ko) ? (
                  <span className="text-sam-muted">{tradePromotionListingReasonLabel(p, ko)}</span>
                ) : null}
              </span>
              <span className="text-sam-muted">
                {p.start_at ? `${pht(p.start_at)} ~ ${p.end_at ? pht(p.end_at) : "—"}` : t("admin_trade_promo_requested_at", { date: pht(p.created_at) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
