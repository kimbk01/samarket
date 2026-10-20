/**
 * CUT 4 — Admin list/detail/event summary loader (service_role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlatformPopupCreativePublicUrl } from "@/lib/platform-popup/resolve-popup-creative-url";
import { isBenefitDialogEligibleForEventSections } from "@/lib/platform-popup/event-benefit-authority";
import { PTR_REVEAL_PRESENTATION, normalizePtrBandVariant, type PtrBandVariant } from "@/lib/platform-popup/ptr-reveal-contract";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import {
  PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS,
  PLATFORM_POPUP_LIVE_STATUS_FILTER,
} from "@/lib/platform-popup/admin-list-filter";
import { PLATFORM_POPUP_COMPOSITIONS } from "@/lib/platform-popup/resolve-presentation-composition";
import {
  escapeAdminIlike,
  quotePostgrestOrValue,
  sanitizeAdminListSearch,
} from "@/lib/admin/pagination/parse-admin-list-page";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupCtaType,
  PlatformPopupEventType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export type PlatformPopupAdminListItem = {
  id: string;
  name: string;
  status: PlatformPopupCampaignStatus;
  approvalStatus: PlatformPopupApprovalStatus;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  suppressionMode: PlatformPopupSuppressionMode;
  suppressionDurationSeconds: number | null;
  presentationType: string;
  /** Ready creative mode — required to distinguish Artwork vs Card (shared center_modal). */
  creativeMode: string | null;
  frequencyMode: string;
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  ctaLabel: string | null;
  title: string | null;
  body: string | null;
  surfaces: PlatformPopupTargetSurface[];
  ownerStoreId: string | null;
  ownerRequestId: string | null;
  updatedAt: string;
  creativeThumbUrl: string | null;
  /** Event Dist reverse-link when this campaign was materialized from an Event. */
  linkedEventId: string | null;
  linkedEventTitle: string | null;
  linkedEventHasBenefit: boolean | null;
};

export type PlatformPopupAdminDetail = PlatformPopupAdminListItem & {
  createdAt: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  creative: {
    id: string;
    status: string;
    aspectW: number;
    aspectH: number;
    creativeMode: string;
    assetPath: string;
    assetUrl: string | null;
    imageUrl: string;
    altText: string | null;
  } | null;
  /** ptr_reveal 전용 — ready 띠 소재(변형별 1개). 팝업 캠페인은 빈 배열. */
  ptrBands: Array<{
    id: string;
    variant: PtrBandVariant;
    aspectW: number;
    aspectH: number;
    imageUrl: string;
    altText: string | null;
  }>;
  /** ptr_reveal 제한 노출 — 기본 all. 팝업은 항상 all(컬럼 기본값). */
  audienceMode: "all" | "allowlist";
  audienceUserIds: string[];
  eventSummary: Record<PlatformPopupEventType, number>;
  /** Impression/click/… counts keyed by resolved surface (nullable → "UNKNOWN"). */
  eventSummaryBySurface: Record<string, Partial<Record<PlatformPopupEventType, number>>>;
  derived: {
    ctr: number | null;
    dismissRate: number | null;
    suppressRate: number | null;
    landingSuccessRate: number | null;
    spendRoas: "N/A";
  };
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  approval_status: string;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  suppression_mode: string;
  suppression_duration_seconds: number | null;
  presentation_type?: string | null;
  frequency_mode?: string | null;
  cta_type: string;
  cta_target: string;
  external_url: string | null;
  cta_label?: string | null;
  title?: string | null;
  body?: string | null;
  owner_store_id: string | null;
  owner_request_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  audience_mode?: string | null;
  audience_user_ids?: string[] | null;
};

function emptyEventSummary(): Record<PlatformPopupEventType, number> {
  return {
    eligible: 0,
    impression: 0,
    click: 0,
    dismiss: 0,
    suppress: 0,
    landing_success: 0,
    landing_failure: 0,
  };
}

function rate(num: number, den: number): number | null {
  if (!(den > 0)) return null;
  return num / den;
}

function mapListItem(
  row: CampaignRow,
  surfaces: PlatformPopupTargetSurface[],
  thumb: string | null,
  creativeMode: string | null,
  linked: {
    eventId: string | null;
    eventTitle: string | null;
    hasBenefit: boolean | null;
  }
): PlatformPopupAdminListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status as PlatformPopupCampaignStatus,
    approvalStatus: row.approval_status as PlatformPopupApprovalStatus,
    priority: row.priority,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    suppressionMode: row.suppression_mode as PlatformPopupSuppressionMode,
    suppressionDurationSeconds: row.suppression_duration_seconds,
    presentationType: row.presentation_type ?? "bottom_sheet",
    creativeMode,
    frequencyMode: row.frequency_mode ?? "close_only",
    ctaType: row.cta_type as PlatformPopupCtaType,
    ctaTarget: row.cta_target ?? "",
    externalUrl: row.external_url,
    ctaLabel: row.cta_label ? String(row.cta_label) : null,
    title: row.title ? String(row.title) : null,
    body: row.body ? String(row.body) : null,
    surfaces,
    ownerStoreId: row.owner_store_id,
    ownerRequestId: row.owner_request_id,
    updatedAt: row.updated_at,
    creativeThumbUrl: thumb,
    linkedEventId: linked.eventId,
    linkedEventTitle: linked.eventTitle,
    linkedEventHasBenefit: linked.hasBenefit,
  };
}

/** 목록 범위 — `popup`(기본): 팝업만, `ptr`: 당겨서 새로고침 띠 광고만. 두 메뉴가 서로의 캠페인을 보이지 않게 분리. */
export type PlatformPopupAdminListScope = "popup" | "ptr";

const PLATFORM_POPUP_ADMIN_LIST_COLUMNS =
  "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, presentation_type, frequency_mode, cta_type, cta_target, external_url, cta_label, title, body, owner_store_id, owner_request_id, created_by, approved_by, approved_at, created_at, updated_at";

export async function listPlatformPopupAdminCampaigns(
  sb: SupabaseClient,
  input?: { status?: string | null; limit?: number; scope?: PlatformPopupAdminListScope }
): Promise<{ ok: true; items: PlatformPopupAdminListItem[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);
  let q = sb
    .from("platform_popup_campaigns")
    .select(PLATFORM_POPUP_ADMIN_LIST_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (input?.status) {
    q = q.eq("status", input.status);
  }
  if (input?.scope === "ptr") {
    q = q.eq("presentation_type", PTR_REVEAL_PRESENTATION);
  } else {
    q = q.or(`presentation_type.is.null,presentation_type.neq.${PTR_REVEAL_PRESENTATION}`);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as CampaignRow[];
  if (!rows.length) return { ok: true, items: [] };
  return { ok: true, items: await buildPlatformPopupAdminListItems(sb, rows) };
}

// ── R7 서버 페이지 목록 · 건수 (팝업 / 당겨서 새로고침 목록 화면 · 대시보드 공용) ─────────────

export { PLATFORM_POPUP_LIVE_STATUS_FILTER, PLATFORM_POPUP_ADMIN_LIST_STATUS_FILTERS };

export type PlatformPopupAdminListFilter = {
  scope?: PlatformPopupAdminListScope;
  /** "" = 전체 · `live` = 지금 노출 중 · 그 외 DB 상태값 (허용 목록 밖이면 무시) */
  status?: string | null;
  /** 팝업 형태 (`PLATFORM_POPUP_COMPOSITIONS`) — scope=popup 에서만 */
  composition?: string | null;
  /** 이름·문구·이동 경로 검색 */
  q?: string | null;
  /** 「지금」 기준 시각 (테스트·대시보드 동일 시각용). 기본 현재. */
  nowIso?: string;
};

const POPUP_INTERRUPTIVE_CENTER_TYPES = ["center_modal", "inline_banner", "hero_banner"] as const;
/** 빈 id 집합용 (`in.()` 은 PostgREST 오류) */
const NO_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

type FilterableQuery = {
  eq(column: string, value: unknown): FilterableQuery;
  in(column: string, values: readonly unknown[]): FilterableQuery;
  url: URL;
};

/** 아트워크 팝업(준비된 기본 소재가 artwork) 캠페인 id — 형태 필터용 id 집합 (DB 조회). */
async function loadArtworkCampaignIds(sb: SupabaseClient): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("platform_popup_creatives")
    .select("*")
    .eq("status", "ready")
    .eq("creative_mode", "artwork");
  if (error) return { ok: false, error: error.message };
  const ids = new Set<string>();
  for (const c of data ?? []) {
    const row = c as { campaign_id?: string | null; variant?: string | null };
    if (normalizePtrBandVariant(row.variant) !== "default") continue;
    const id = String(row.campaign_id ?? "").trim();
    if (id) ids.add(id);
  }
  return { ok: true, ids: [...ids] };
}

/**
 * 목록 필터를 쿼리에 적용 — 목록(range)과 건수(head count)가 같은 조건을 쓴다.
 * 여러 `or` 묶음은 `and=(…)` 한 파라미터로 합친다 (`applyPostgrestAndGroup`).
 */
async function applyPlatformPopupAdminListFilter<Q extends FilterableQuery>(
  sb: SupabaseClient,
  query: Q,
  filter: PlatformPopupAdminListFilter
): Promise<{ ok: true; query: Q } | { ok: false; error: string }> {
  let q = query;
  const groups: string[] = [];
  const scope = filter.scope === "ptr" ? "ptr" : "popup";
  if (scope === "ptr") {
    q = q.eq("presentation_type", PTR_REVEAL_PRESENTATION) as Q;
  } else {
    groups.push(`or(presentation_type.is.null,presentation_type.neq.${PTR_REVEAL_PRESENTATION})`);
  }

  const status = String(filter.status ?? "").trim();
  if (status === PLATFORM_POPUP_LIVE_STATUS_FILTER) {
    const now = quotePostgrestOrValue(filter.nowIso ?? new Date().toISOString());
    q = q.eq("status", "active") as Q;
    groups.push(`or(start_at.is.null,start_at.lte.${now})`);
    groups.push(`or(end_at.is.null,end_at.gte.${now})`);
  } else if (status && (PLATFORM_POPUP_CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status) as Q;
  }

  const composition = String(filter.composition ?? "").trim();
  if (scope === "popup" && (PLATFORM_POPUP_COMPOSITIONS as readonly string[]).includes(composition)) {
    if (composition === "benefit_dialog") {
      q = q.eq("presentation_type", "benefit_dialog") as Q;
    } else if (composition === "bottom_promotion_sheet") {
      groups.push("or(presentation_type.is.null,presentation_type.eq.bottom_sheet)");
    } else {
      q = q.in("presentation_type", POPUP_INTERRUPTIVE_CENTER_TYPES) as Q;
      const art = await loadArtworkCampaignIds(sb);
      if (!art.ok) return art;
      const ids = art.ids.length ? art.ids : [NO_CAMPAIGN_ID];
      if (composition === "artwork_modal") q = q.in("id", ids) as Q;
      else groups.push(`id.not.in.(${ids.join(",")})`);
    }
  }

  const term = sanitizeAdminListSearch(filter.q);
  if (term) {
    const like = quotePostgrestOrValue(`%${escapeAdminIlike(term)}%`);
    groups.push(
      `or(name.ilike.${like},title.ilike.${like},cta_target.ilike.${like},external_url.ilike.${like})`
    );
  }

  if (groups.length) applyPostgrestAndGroup(q, `(${groups.join(",")})`);
  return { ok: true, query: q };
}

/**
 * 팝업 / 당겨서 새로고침 목록 — 서버 페이지 (`limit`/`offset` + `total` = count exact).
 * 화면: `/admin/platform-popup` · `/admin/ptr-reveal-ads` (API `limit` 파라미터가 있을 때).
 */
export async function listPlatformPopupAdminCampaignPage(
  sb: SupabaseClient,
  input: { filter: PlatformPopupAdminListFilter; limit: number; offset: number }
): Promise<
  { ok: true; items: PlatformPopupAdminListItem[]; total: number } | { ok: false; error: string }
> {
  const base = sb
    .from("platform_popup_campaigns")
    .select(PLATFORM_POPUP_ADMIN_LIST_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);
  const applied = await applyPlatformPopupAdminListFilter(sb, base as unknown as FilterableQuery, input.filter);
  if (!applied.ok) return applied;
  const { data, error, count } = (await (applied.query as unknown as PromiseLike<{
    data: unknown;
    error: { message: string } | null;
    count: number | null;
  }>));
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as CampaignRow[];
  const items = rows.length ? await buildPlatformPopupAdminListItems(sb, rows) : [];
  return { ok: true, items, total: count ?? rows.length };
}

/**
 * 팝업 / 당겨서 새로고침 캠페인 건수 — 목록 화면과 같은 필터 함수.
 * 대시보드 「집행 중 팝업」: `countPlatformPopupAdminCampaigns(sb, { status: PLATFORM_POPUP_LIVE_STATUS_FILTER })`
 * → 이동 화면 `/admin/platform-popup?status=live` 의 「총 N건」과 같다.
 */
export async function countPlatformPopupAdminCampaigns(
  sb: SupabaseClient,
  filter: PlatformPopupAdminListFilter
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const base = sb.from("platform_popup_campaigns").select("id", { count: "exact", head: true });
  const applied = await applyPlatformPopupAdminListFilter(sb, base as unknown as FilterableQuery, filter);
  if (!applied.ok) return applied;
  const { error, count } = (await (applied.query as unknown as PromiseLike<{
    error: { message: string } | null;
    count: number | null;
  }>));
  if (error) return { ok: false, error: error.message };
  return { ok: true, total: count ?? 0 };
}

/** 캠페인 행 → 목록 항목 (노출 위치·썸네일·연결 이벤트 보강). */
async function buildPlatformPopupAdminListItems(
  sb: SupabaseClient,
  rows: CampaignRow[]
): Promise<PlatformPopupAdminListItem[]> {
  const ids = rows.map((r) => r.id);
  const [{ data: surfaceRows }, { data: creativeRows }, { data: distRows }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("campaign_id, surface").in("campaign_id", ids),
    sb
      .from("platform_popup_creatives")
      .select("*")
      .in("campaign_id", ids)
      .eq("status", "ready"),
    sb
      .from("platform_promotion_distributions")
      .select("content_id, channel_ref_id")
      .eq("channel", "popup")
      .eq("content_type", "platform_event")
      .in("channel_ref_id", ids),
  ]);

  const surfacesBy = new Map<string, PlatformPopupTargetSurface[]>();
  for (const s of surfaceRows ?? []) {
    const cid = String((s as { campaign_id: string }).campaign_id);
    const list = surfacesBy.get(cid) ?? [];
    list.push((s as { surface: PlatformPopupTargetSurface }).surface);
    surfacesBy.set(cid, list);
  }

  const thumbBy = new Map<string, string>();
  const modeBy = new Map<string, string>();
  for (const c of creativeRows ?? []) {
    const row = c as {
      campaign_id: string;
      asset_path: string;
      asset_url: string | null;
      creative_mode?: string | null;
      variant?: string | null;
    };
    // PTR 캠페인: 썸네일은 휴대폰 띠(default)
    if (normalizePtrBandVariant(row.variant) !== "default") continue;
    const url = resolvePlatformPopupCreativePublicUrl({
      assetUrl: row.asset_url,
      assetPath: row.asset_path,
    });
    if (url) thumbBy.set(row.campaign_id, url);
    if (row.creative_mode) modeBy.set(row.campaign_id, String(row.creative_mode));
  }

  const eventIdByCampaign = new Map<string, string>();
  for (const d of distRows ?? []) {
    const ref = String((d as { channel_ref_id?: string | null }).channel_ref_id ?? "").trim();
    const eventId = String((d as { content_id?: string }).content_id ?? "").trim();
    if (ref && eventId) eventIdByCampaign.set(ref, eventId);
  }
  for (const r of rows) {
    if (eventIdByCampaign.has(r.id)) continue;
    if (r.cta_type === "event_detail" && r.cta_target) {
      const tid = String(r.cta_target).trim();
      if (tid) eventIdByCampaign.set(r.id, tid);
    }
  }

  const eventIds = [...new Set(eventIdByCampaign.values())];
  const eventMeta = new Map<string, { title: string; hasBenefit: boolean }>();
  if (eventIds.length > 0) {
    const { data: events } = await sb
      .from("platform_events")
      .select("id, title, sections")
      .in("id", eventIds);
    for (const ev of events ?? []) {
      const id = String((ev as { id: string }).id);
      eventMeta.set(id, {
        title: String((ev as { title?: string }).title ?? ""),
        hasBenefit: isBenefitDialogEligibleForEventSections(
          (ev as { sections?: unknown }).sections
        ),
      });
    }
  }

  return rows.map((r) => {
    const linkedEventId = eventIdByCampaign.get(r.id) ?? null;
    const meta = linkedEventId ? eventMeta.get(linkedEventId) : null;
    return mapListItem(
      r,
      surfacesBy.get(r.id) ?? [],
      thumbBy.get(r.id) ?? null,
      modeBy.get(r.id) ?? null,
      {
        eventId: linkedEventId,
        eventTitle: meta?.title ?? null,
        hasBenefit: meta ? meta.hasBenefit : linkedEventId ? null : null,
      }
    );
  });
}

export async function loadPlatformPopupAdminCampaignDetail(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ ok: true; campaign: PlatformPopupAdminDetail } | { ok: false; error: string; httpStatus?: number }> {
  const id = campaignId.trim();
  if (!id) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data, error } = await sb
    .from("platform_popup_campaigns")
    .select(
      "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, presentation_type, frequency_mode, cta_type, cta_target, external_url, cta_label, title, body, owner_store_id, owner_request_id, created_by, approved_by, approved_at, created_at, updated_at, audience_mode, audience_user_ids"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };

  const row = data as CampaignRow;
  const [{ data: surfaceRows }, { data: creativeRows }, { data: eventRows }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("surface").eq("campaign_id", id),
    // `*` — variant 컬럼(PTR 마이그레이션 이후) 유무와 무관. PTR 은 변형별 ready 가 여러 개.
    sb.from("platform_popup_creatives").select("*").eq("campaign_id", id).eq("status", "ready"),
    sb.from("platform_popup_campaign_events").select("event_type, surface").eq("campaign_id", id),
  ]);
  const readyCreatives = (creativeRows ?? []) as Array<{
    id: string;
    status: string;
    aspect_w: number;
    aspect_h: number;
    creative_mode?: string | null;
    variant?: string | null;
    asset_path: string;
    asset_url: string | null;
    alt_text: string | null;
  }>;
  const creativeRow =
    readyCreatives.find((c) => normalizePtrBandVariant(c.variant) === "default") ?? null;
  const ptrBands: PlatformPopupAdminDetail["ptrBands"] = readyCreatives
    .filter((c) => c.creative_mode === "ptr_band")
    .map((c) => ({
      id: c.id,
      variant: normalizePtrBandVariant(c.variant),
      aspectW: c.aspect_w,
      aspectH: c.aspect_h,
      imageUrl: resolvePlatformPopupCreativePublicUrl({ assetUrl: c.asset_url, assetPath: c.asset_path }),
      altText: c.alt_text,
    }));

  const surfaces = (surfaceRows ?? []).map(
    (s) => (s as { surface: PlatformPopupTargetSurface }).surface
  );
  const summary = emptyEventSummary();
  const bySurface: Record<string, Partial<Record<PlatformPopupEventType, number>>> = {};
  for (const e of eventRows ?? []) {
    const row = e as { event_type: string; surface: string | null };
    const t = String(row.event_type) as PlatformPopupEventType;
    if (t in summary) summary[t] += 1;
    const surf = (row.surface ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const bucket = bySurface[surf] ?? {};
    bucket[t] = (bucket[t] ?? 0) + 1;
    bySurface[surf] = bucket;
  }

  let creative: PlatformPopupAdminDetail["creative"] = null;
  let thumb: string | null = null;
  if (creativeRow) {
    const c = creativeRow;
    const imageUrl = resolvePlatformPopupCreativePublicUrl({
      assetUrl: c.asset_url,
      assetPath: c.asset_path,
    });
    thumb = imageUrl || null;
    creative = {
      id: c.id,
      status: c.status,
      aspectW: c.aspect_w,
      aspectH: c.aspect_h,
      creativeMode: c.creative_mode ?? "card",
      assetPath: c.asset_path,
      assetUrl: c.asset_url,
      imageUrl,
      altText: c.alt_text,
    };
  }

  const list = mapListItem(row, surfaces, thumb, creative?.creativeMode ?? null, {
    eventId: null,
    eventTitle: null,
    hasBenefit: null,
  });
  const audienceMode =
    String(row.audience_mode ?? "all").trim().toLowerCase() === "allowlist" ? "allowlist" : "all";
  const audienceUserIds = Array.isArray(row.audience_user_ids)
    ? row.audience_user_ids.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    ok: true,
    campaign: {
      ...list,
      createdAt: row.created_at,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      creative,
      ptrBands,
      audienceMode,
      audienceUserIds,
      eventSummary: summary,
      eventSummaryBySurface: bySurface,
      derived: {
        ctr: rate(summary.click, summary.impression),
        dismissRate: rate(summary.dismiss, summary.impression),
        suppressRate: rate(summary.suppress, summary.impression),
        landingSuccessRate: rate(
          summary.landing_success,
          summary.landing_success + summary.landing_failure
        ),
        spendRoas: "N/A",
      },
    },
  };
}
