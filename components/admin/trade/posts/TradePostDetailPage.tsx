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
  MODERATION_STATE_LABELS,
  SELLER_STAGE_LABELS,
  TRADE_POST_MODERATION_ACTION_LABELS,
  allowedTradePostModerationActions,
  type TradePostModerationAction,
} from "@/lib/admin/trade-admin/trade-post-tabs";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { ADMIN_DASHBOARD_REPORT_REASON_LABELS } from "@/lib/admin-dashboard/report-reason-labels";
import { imageSanitizeViewerMediaUrl } from "@/lib/image/image-url";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";

const LIST_PATH = "/admin/posts-management";
const FIELD =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-60";
const REASON = { minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "처리 사유를 입력해 주세요" };

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

const AUDIT_ACTION_KO: Record<string, string> = {
  "trade_post.hide": "숨김",
  "trade_post.unhide": "숨김 해제",
  "trade_post.delete": "삭제",
  "trade_post.undelete": "삭제 취소",
  "trade_post.confirm_admin_hidden": "관리자 숨김으로 확정",
  "trade_post.edit": "내용 수정",
  "trade_post.sale_stage_active": "판매 단계 정정 — 판매중",
  "trade_post.sale_stage_reserved": "판매 단계 정정 — 예약중",
  "trade_post.sale_stage_sold": "판매 단계 정정 — 거래완료",
  "trade_post.cancel_sale": "판매 취소",
  "trade_post.force_complete": "강제 거래완료",
};

const PROMOTION_STATUS_KO: Record<string, string> = {
  pending_review: "검토 대기",
  active: "진행 중",
  paused: "일시 중지",
  ended: "종료",
  expired: "기간 만료",
  rejected: "반려",
  cancelled: "취소",
};

const EXTRA_ERROR_KO: Record<string, string> = {
  title_required: "제목을 입력해 주세요.",
  invalid_category: "거래 카테고리를 다시 선택해 주세요.",
  invalid_images: "사진 목록을 다시 확인해 주세요.",
  empty_patch: "바뀐 내용이 없습니다.",
  invalid_action: "지금 상태에서는 할 수 없는 조치입니다.",
};

function errorTextOf(code: string, status: number): string {
  if (EXTRA_ERROR_KO[code]) return EXTRA_ERROR_KO[code];
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
    const keep = res.status === 403 || res.status === 404 || res.status === 409 || raw === "stale_state";
    return { result: { ok: false, status: res.status, code: keep ? raw : errorTextOf(raw, res.status) }, json };
  } catch {
    return { result: { ok: false, status: 0, code: tradeErrorText("server_error") }, json: {} };
  }
}

function warningsOf(json: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (json.sideEffectWarning) out.push("알림 발송 실패");
  if (json.auditWarning) out.push("처리 기록 저장 실패 — 관리자에게 알려 주세요");
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

function shortMember(id: string): string {
  return `회원 ${formatAdminShortId(id)}`;
}

/* ───────── 사진 ───────── */

function TradeImageGallery({ images, size = 112 }: { images: string[]; size?: number }) {
  if (images.length === 0) return <p className="text-[13px] text-sam-muted">등록된 사진이 없습니다.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {images.map((u, i) => {
        const href = imageSanitizeViewerMediaUrl(u);
        const thumb = <TradePostThumb post={{ images: [u] }} size={size} />;
        return (
          <li key={`${u}-${i}`} className="relative">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" title="원본 보기">
                {thumb}
              </a>
            ) : (
              thumb
            )}
            {i === 0 ? (
              <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-fg/80 px-1.5 py-0.5 text-[12px] font-semibold text-sam-surface">
                대표
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
  const { language } = useI18n();
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
    return (bid: string) => m.get(bid) ?? shortMember(bid);
  }, [data?.rooms, post]);

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
      setWarnings(warningsOf(json));
      if (opts.closeEdit) setEditing(false);
    } else if (kind === "stale") {
      setBanner(null);
      setNotice({ tone: "warn", text: "다른 관리자가 먼저 변경했습니다 — 최신 내용으로 다시 불러왔습니다." });
      setEditing(false);
    } else {
      setBanner(null);
      setNotice({ tone: "warn", text: "대상을 찾을 수 없습니다 — 다시 불러왔습니다." });
    }
    reload();
  };

  const run = async (url: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
    const { result, json } = await tradeActionFetch(url, method, body);
    lastJson.current = json;
    return { result, json };
  };

  if (!id) return <AdminEmptyState ko={ko} message="게시물을 찾을 수 없습니다." />;
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
  const canCancelSale = post.seller_listing_state === "reserved" || post.seller_listing_state === "completed" || post.seller_listing_state === "negotiating";
  const canForceComplete = post.seller_listing_state !== "completed";
  const expected = post.updated_at ?? undefined;
  const postApi = `/api/admin/trade/posts/${encodeURIComponent(id)}`;
  const legacyApi = `/api/admin/posts/${encodeURIComponent(id)}`;
  const busy = state.status === "loading";

  const summaryRows: { label: string; value: ReactNode }[] = [
    { label: "가격", value: formatTradePrice(post.price, post.is_free_share) + (post.is_price_offer ? " · 가격 제안 받음" : "") },
    { label: "판매 단계", value: <TradeStageBadge value={post.seller_listing_state} /> },
    { label: "노출", value: <TradeVisibilityBadges moderationState={post.moderation_state} ownerState={post.owner_state} /> },
    { label: "판매자", value: <TradeMemberCell userId={post.user_id} label={post.seller_label} returnTo={selfHref} /> },
    { label: "유형", value: post.trade_type === "job" ? "알바" : "중고" },
    { label: "지역", value: post.region_label ?? "—" },
    { label: "카테고리", value: post.category_name ?? "—" },
    { label: "조회·찜·채팅", value: `${post.view_count ?? 0} · ${post.favorite_count ?? 0} · ${post.chat_count ?? 0}` },
    { label: "등록", value: pht(post.created_at) },
    { label: "수정", value: pht(post.updated_at) },
  ];
  if (post.reserved_buyer_id) {
    summaryRows.push({
      label: "예약 구매자",
      value: <TradeMemberCell userId={post.reserved_buyer_id} label={post.reserved_buyer_label} returnTo={selfHref} />,
    });
  }
  if (post.sold_buyer_id || post.seller_listing_state === "completed") {
    summaryRows.push({
      label: "거래완료 구매자",
      value: post.sold_buyer_id ? (
        <TradeMemberCell userId={post.sold_buyer_id} label={post.sold_buyer_label} returnTo={selfHref} />
      ) : (
        "—"
      ),
    });
    summaryRows.push({ label: "거래 완료 시각", value: post.completed_at ? pht(post.completed_at) : "완료 시각 기록 없음" });
  }
  if (modState !== "visible") {
    summaryRows.push({ label: "관리자 조치", value: MODERATION_STATE_LABELS[modState] ?? "—" });
    summaryRows.push({ label: "조치 사유", value: post.moderation_reason?.trim() || "—" });
    summaryRows.push({ label: "처리자", value: post.moderation_by_label ?? "—" });
    summaryRows.push({ label: "처리 시각", value: pht(post.moderation_at) });
  }

  const targetRows = [
    { label: "게시물", value: post.title?.trim() || "제목 없음" },
    { label: "판매 단계", value: SELLER_STAGE_LABELS[String(post.seller_listing_state ?? "")] ?? "—" },
    { label: "노출", value: <TradeVisibilityBadges moderationState={post.moderation_state} ownerState={post.owner_state} /> },
  ];

  const buyerPicker = (required: boolean) => (
    <label className="block">
      <span className="sam-text-helper font-medium text-sam-fg">구매자{required ? " (선택 필요)" : ""}</span>
      <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className={`mt-1 ${FIELD}`}>
        <option value="">{required ? "구매자를 선택해 주세요" : "자동 지정 (예약 구매자 또는 채팅 구매자 1명)"}</option>
        {(buyers ?? []).map((b) => (
          <option key={b} value={b}>
            {buyerLabelOf(b)}
          </option>
        ))}
      </select>
      {buyers === null ? <span className="mt-1 block sam-text-xxs text-sam-muted">구매자 후보를 불러오는 중…</span> : null}
      {buyers !== null && buyers.length === 0 ? (
        <span className="mt-1 block sam-text-xxs text-sam-muted">거래 채팅을 한 구매자가 없습니다.</span>
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
            {post.title?.trim() || "제목 없음"}
          </h1>
          <p className="mt-1 sam-text-body text-sam-muted">{formatTradePrice(post.price, post.is_free_share)}</p>
        </div>
        <AdminActionButton variant="secondary" onClick={reload} disabled={busy}>
          {busy ? "불러오는 중…" : "새로고침"}
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
            수정
          </AdminActionButton>
          {modActions.map((a) => (
            <AdminActionButton
              key={a}
              variant={a === "delete" || a === "hide" ? "danger" : "secondary"}
              disabled={busy}
              onClick={() => openSheet({ kind: "moderation", action: a })}
            >
              {TRADE_POST_MODERATION_ACTION_LABELS[a]}
            </AdminActionButton>
          ))}
          <AdminActionButton variant="secondary" disabled={busy} onClick={() => openSheet({ kind: "stage" })}>
            판매 단계 정정
          </AdminActionButton>
          {canCancelSale ? (
            <AdminActionButton variant="danger" disabled={busy} onClick={() => openSheet({ kind: "cancel_sale" })}>
              판매 취소
            </AdminActionButton>
          ) : null}
          {canForceComplete ? (
            <AdminActionButton variant="secondary" disabled={busy} onClick={() => openSheet({ kind: "force_complete" })}>
              강제 완료
            </AdminActionButton>
          ) : null}
        </div>
      </section>

      {editing ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <h2 className="text-[14px] font-semibold text-sam-fg">내용 수정</h2>
          <label className="block text-[12px] font-medium text-sam-muted">
            제목
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} maxLength={200} className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block text-[12px] font-medium text-sam-muted">
            본문
            <textarea value={eContent} onChange={(e) => setEContent(e.target.value)} rows={8} className={`mt-1 ${FIELD}`} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-[12px] font-medium text-sam-muted">
              가격 (₱)
              <input
                inputMode="numeric"
                value={ePrice}
                onChange={(e) => setEPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className={`mt-1 w-36 ${FIELD}`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-sam-fg">
              <input type="checkbox" checked={eFree} onChange={(e) => setEFree(e.target.checked)} />
              나눔
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-sam-fg">
              <input type="checkbox" checked={eOffer} onChange={(e) => setEOffer(e.target.checked)} />
              가격 제안 받기
            </label>
            <label className="block min-w-[12rem] text-[12px] font-medium text-sam-muted">
              카테고리
              <select value={eCategory} onChange={(e) => setECategory(e.target.value)} className={`mt-1 ${FIELD}`}>
                {!eCategory ? <option value="">선택해 주세요</option> : null}
                {eCategory && !categories.some((c) => c.id === eCategory) ? (
                  <option value={eCategory}>{post.category_name ?? "현재 카테고리"}</option>
                ) : null}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.active ? c.name : `${c.name} (비활성)`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="text-[12px] font-medium text-sam-muted">사진 ({eImages.length}장 · 첫 번째가 대표)</p>
            {eImages.length === 0 ? (
              <p className="mt-1 text-[13px] text-sam-muted">사진이 없습니다.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-3">
                {eImages.map((u, i) => (
                  <li key={`${u}-${i}`} className="flex flex-col items-center gap-1">
                    <span className="relative">
                      <TradePostThumb post={{ images: [u] }} size={88} />
                      {i === 0 ? (
                        <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-fg/80 px-1.5 py-0.5 text-[12px] font-semibold text-sam-surface">
                          대표
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
                          대표로
                        </AdminActionButton>
                      ) : null}
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setEImages((arr) => arr.filter((_, j) => j !== i))}
                      >
                        삭제
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
              취소
            </AdminActionButton>
            <AdminActionButton variant="primary" disabled={!dirty || !editValid || busy} onClick={() => openSheet({ kind: "edit" })}>
              저장
            </AdminActionButton>
          </div>
        </section>
      ) : null}

      <CommunityTabs
        tabs={[
          { value: "revisions", label: "수정 이력", count: counts.revisions },
          { value: "reports", label: "신고", count: counts.reports },
          { value: "rooms", label: "거래 채팅", count: counts.rooms },
          { value: "promotions", label: "홍보", count: counts.promotions },
          { value: "audits", label: "조치 기록", count: counts.audits },
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
              action: AUDIT_ACTION_KO[a.action] ?? "기타 처리",
              reason: typeof a.after_json?.reason === "string" ? a.after_json.reason : null,
            }))}
          />
        )}
      </section>

      {/* ───── 시트 ───── */}
      {sheet?.kind === "edit" ? (
        <CommunityActionSheet
          title="수정 내용 저장"
          rows={[
            ...targetRows.slice(0, 1),
            { label: "바뀌는 항목", value: Object.keys(patch).map((k) => FIELD_LABEL[k] ?? k).join(", ") || "—" },
          ]}
          notice="판매자에게 수정 알림이 갑니다."
          reason={REASON}
          ready={dirty && editValid}
          confirmLabel="저장"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => (await run(postApi, "PATCH", { patch, reason, expectedUpdatedAt: expected })).result}
          onSettled={(k) => onSettled(k, "수정 내용을 저장했습니다.", { closeEdit: true })}
        />
      ) : null}

      {sheet?.kind === "moderation" ? (
        <CommunityActionSheet
          title={`게시물 ${TRADE_POST_MODERATION_ACTION_LABELS[sheet.action]}`}
          rows={targetRows}
          notice={MODERATION_NOTICE[sheet.action]}
          reason={REASON}
          destructive={sheet.action === "delete" || sheet.action === "hide"}
          confirmLabel={TRADE_POST_MODERATION_ACTION_LABELS[sheet.action]}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) =>
            (await run(`${postApi}/moderation`, "POST", { action: sheet.action, reason, expectedUpdatedAt: expected })).result
          }
          onSettled={(k) => onSettled(k, `${TRADE_POST_MODERATION_ACTION_LABELS[sheet.action]} 처리했습니다.`)}
        />
      ) : null}

      {sheet?.kind === "stage" ? (
        <CommunityActionSheet
          title="판매 단계 정정"
          rows={targetRows}
          notice="노출 상태는 바뀌지 않습니다."
          reason={REASON}
          ready={stage !== stageNow && (!needBuyer || stage !== "sold" || Boolean(buyerId))}
          confirmLabel="정정"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const body: Record<string, unknown> = { status: stage, reason };
            if (stage === "sold" && buyerId) body.soldBuyerId = buyerId;
            const { result, json } = await run(`${legacyApi}/status`, "POST", body);
            if (!result.ok && json.code === "need_sold_buyer") setNeedBuyer(true);
            return result;
          }}
          onSettled={(k) => onSettled(k, "판매 단계를 정정했습니다.")}
        >
          <fieldset className="space-y-1">
            <legend className="sam-text-helper font-medium text-sam-fg">바꿀 판매 단계</legend>
            {(
              [
                ["active", "판매중"],
                ["reserved", "예약중"],
                ["sold", "거래완료"],
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
                {l}
                {v === stageNow ? <span className="text-sam-muted">(현재)</span> : null}
              </label>
            ))}
          </fieldset>
          {stage === "sold" ? buyerPicker(needBuyer) : null}
        </CommunityActionSheet>
      ) : null}

      {sheet?.kind === "cancel_sale" ? (
        <CommunityActionSheet
          title="판매 취소"
          rows={targetRows}
          notice={
            modState === "visible"
              ? "판매중으로 되돌리고 게시물을 관리자 숨김으로 바꿉니다. 거래 채팅도 판매중 상태로 돌아갑니다."
              : "판매중으로 되돌립니다. 거래 채팅도 판매중 상태로 돌아갑니다."
          }
          reason={REASON}
          destructive
          confirmLabel="판매 취소"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => (await run(`${legacyApi}/trade-override`, "POST", { action: "cancel_sale", reason })).result}
          onSettled={(k) => onSettled(k, "판매를 취소했습니다.")}
        />
      ) : null}

      {sheet?.kind === "force_complete" ? (
        <CommunityActionSheet
          title="강제 완료"
          rows={targetRows}
          notice="판매자 완료 절차 없이 거래완료로 바꿉니다. 거래 완료 시각은 기록되지 않습니다."
          reason={REASON}
          ready={!needBuyer || Boolean(buyerId)}
          confirmLabel="강제 완료"
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            const body: Record<string, unknown> = { action: "force_complete", reason };
            if (buyerId) body.buyerId = buyerId;
            const { result, json } = await run(`${legacyApi}/trade-override`, "POST", body);
            if (!result.ok && json.code === "need_sold_buyer") setNeedBuyer(true);
            return result;
          }}
          onSettled={(k) => onSettled(k, "거래완료로 처리했습니다.")}
        >
          {buyerPicker(needBuyer)}
        </CommunityActionSheet>
      ) : null}
    </div>
  );
}

const MODERATION_NOTICE: Record<TradePostModerationAction, string> = {
  hide: "앱에서 보이지 않게 됩니다. 판매자는 직접 해제할 수 없습니다.",
  unhide: "앱에 다시 보입니다. 판매 단계는 그대로입니다.",
  delete: "앱에서 삭제된 글로 처리됩니다. 판매자는 직접 되돌릴 수 없습니다.",
  undelete: "삭제를 취소하고 관리자 숨김 상태로 돌립니다.",
};

const FIELD_LABEL: Record<string, string> = {
  title: "제목",
  content: "본문",
  price: "가격",
  trade_category_id: "카테고리",
  images: "사진",
  thumbnail_url: "대표 사진",
  is_price_offer: "가격 제안",
  is_free_share: "나눔",
};

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-block text-[13px] font-medium text-sam-muted hover:text-sam-fg">
      ← 목록으로
    </Link>
  );
}

/* ───────── 탭 ───────── */

function fieldValueText(key: string, v: unknown, categoryName: (id: string) => string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "is_price_offer" || key === "is_free_share") return v === true ? "예" : "아니오";
  if (key === "price") return formatTradePrice(v);
  if (key === "trade_category_id") return categoryName(String(v)) ?? "다른 카테고리";
  if (key === "images") return `${Array.isArray(v) ? v.length : 0}장`;
  if (key === "thumbnail_url") return "사진";
  const s = String(v);
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

function RevisionsTab({ revisions, categoryName }: { revisions: Revision[]; categoryName: (id: string) => string | null }) {
  if (revisions.length === 0) return <p className="text-[13px] text-sam-muted">수정 이력이 없습니다.</p>;
  return (
    <ol className="space-y-2">
      {revisions.map((r) => {
        const before = r.before_json ?? {};
        const after = r.after_json ?? {};
        const keys = Object.keys(FIELD_LABEL).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
        return (
          <li key={r.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-2 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sam-fg">{keys.map((k) => FIELD_LABEL[k]).join(", ") || "변경 없음"}</span>
              <span className="text-sam-muted">
                {pht(r.created_at)} · {r.editor_label ?? "—"}
              </span>
            </div>
            {r.reason ? <p className="mt-1 whitespace-pre-wrap text-sam-muted">사유: {r.reason}</p> : null}
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
                      <dt className="text-sam-muted">{FIELD_LABEL[k]}</dt>
                      <dd className="min-w-0 [overflow-wrap:anywhere]">
                        {k === "thumbnail_url" ? (
                          "대표 사진 변경"
                        ) : sameCount ? (
                          "사진 순서 변경"
                        ) : (
                          <>
                            <span className="whitespace-pre-wrap text-sam-muted line-through">
                              {fieldValueText(k, before[k], categoryName)}
                            </span>
                            <span className="mx-1 text-sam-muted">→</span>
                            <span className="whitespace-pre-wrap text-sam-fg">{fieldValueText(k, after[k], categoryName)}</span>
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
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/trade/reports?targetId=${encodeURIComponent(postId)}`} variant="secondary">
          신고 처리함에서 보기
        </AdminActionLink>
      </div>
      {reports.length === 0 ? (
        <p className="text-[13px] text-sam-muted">이 게시물에 대한 신고가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border-soft px-3 py-2 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AdminToneBadge tone={r.is_open ? "warning" : "neutral"}>{r.is_open ? "처리 대기" : "처리 완료"}</AdminToneBadge>
                  <span className="font-medium text-sam-fg">
                    {ADMIN_DASHBOARD_REPORT_REASON_LABELS[String(r.reason_code ?? "")] ?? "기타"}
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
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/chats?type=trade&postId=${encodeURIComponent(postId)}`} variant="secondary">
          채팅 관리에서 보기
        </AdminActionLink>
      </div>
      {rooms.length === 0 ? (
        <p className="text-[13px] text-sam-muted">이 게시물의 거래 채팅이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-sam-border-soft text-[13px]">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <TradeMemberCell userId={r.buyer_id} label={r.buyer_label} returnTo={selfHref} />
                <TradeStageBadge value={r.trade_status} />
              </span>
              <span className="text-sam-muted">
                마지막 대화 <CommunityTimeCell iso={r.last_message_at ?? r.created_at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromotionsTab({ postId, promotions }: { postId: string; promotions: Promotion[] }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <AdminActionLink href={`/admin/trade/promotions?postId=${encodeURIComponent(postId)}`} variant="secondary">
          홍보 관리에서 보기
        </AdminActionLink>
      </div>
      {promotions.length === 0 ? (
        <p className="text-[13px] text-sam-muted">홍보 신청 기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-sam-border-soft text-[13px]">
          {promotions.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <AdminToneBadge tone={p.order_status === "active" ? "success" : "neutral"}>
                  {PROMOTION_STATUS_KO[String(p.order_status ?? "")] ?? "기타"}
                </AdminToneBadge>
                <span className="text-sam-fg">{formatTradePoints(p.point_cost)}</span>
              </span>
              <span className="text-sam-muted">
                {p.start_at ? `${pht(p.start_at)} ~ ${p.end_at ? pht(p.end_at) : "—"}` : `신청 ${pht(p.created_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
