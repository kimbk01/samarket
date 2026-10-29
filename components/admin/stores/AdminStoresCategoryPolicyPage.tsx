"use client";

/**
 * Delivery CMS — category policy editor.
 * Platform taxonomy stays fixed; this page only edits browse-scope presentation policy.
 */

import { isoToManilaLocal, manilaLocalToIso } from "@/lib/launch-intro/schedule";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminConfigAuditHistoryPanel } from "@/components/admin/delivery/AdminConfigAuditHistoryPanel";
import { AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminDeliveryAdBrowsePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { placementMapFocusHref } from "@/lib/admin/placement-map-read-model";
import {
  type StoresBrowseScopePolicyResolved,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StoresBrowseAdminRankingCriterionId } from "@/lib/stores/stores-browse-ranking-criteria";
import {
  resolveStoresBrowseRankingCriteria,
  STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS,
} from "@/lib/stores/stores-browse-ranking-criteria";
import type { StoresBrowseDiscoveryShelfConfig } from "@/lib/stores/stores-browse-discovery-shelf";
import { isBrowseShelfSelectedSourceValid } from "@/lib/stores/stores-browse-discovery-shelf";
import type { StoresBrowseCustomerSortAvailability } from "@/lib/stores/stores-browse-customer-sort-availability";
import {
  resolveStoresBrowseCustomerSortAvailability,
} from "@/lib/stores/stores-browse-customer-sort-availability";
import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";
import {
  STORES_POPULARITY_WINDOW_DAYS_IDS,
  buildStorePopularityWindowMeta,
  resolvePopularityWindowDays,
} from "@/lib/stores/store-discovery-popular-store";
import { AdminStoresCategoryBrowseLivePreview } from "@/components/admin/stores/AdminStoresCategoryBrowseLivePreview";
import {
  BROWSE_BANNER_CAPACITY_MAX,
  browseBannerCapacityForSave,
  browseSubAdminDraftFrom,
  buildBrowseSubAdminWrite,
  clampBrowseBannerCapacityInput,
  mergeBrowseProductConfig,
  nonNegativeIntOrNull,
  positiveIntOrNull,
  type BrowseScopeAdminWriteRow,
  type BrowseSubAdminDraft,
  type BrowseSubAdminToggleField,
} from "@/lib/stores/product/stores-browse-scope-admin-save";

type PrimaryRow = {
  primarySlug: string;
  nameKo: string;
  nameEn: string;
  scopeKey: string;
  row: StoresBrowseScopePolicyRow | null;
  resolved: StoresBrowseScopePolicyResolved;
};

type SecondaryRow = {
  subSlug: string;
  nameKo: string;
  nameEn: string;
  scopeKey: string;
  row: StoresBrowseScopePolicyRow | null;
  resolved: StoresBrowseScopePolicyResolved;
};

export type CatTab = "basic" | "shelf" | "ad" | "coupon" | "exposure" | "hours";
type TierFocus = "primary" | "secondary";
type ScheduleMode = "always" | "scheduled";

type DraftPrimary = {
  enabled: boolean;
  draftTitleKo: string;
  draftTitleEn: string;
  adEnabled: boolean;
  bannerAdsEnabled: boolean;
  bannerAdsCapacity: string;
  couponEnabled: boolean;
  draftMax: string;
  draftInterval: string;
  scheduleMode: ScheduleMode;
  draftScheduleStart: string;
  draftScheduleEnd: string;
  defaultSort: StoreBrowseServerSortId;
  popularityWindowDays: import("@/lib/stores/store-discovery-popular-store").StoresPopularityWindowDays;
  rankingCriteria: StoresBrowseAdminRankingCriterionId[];
  customerSortAvailability: StoresBrowseCustomerSortAvailability;
  discoveryShelf: StoresBrowseDiscoveryShelfConfig;
};

type DraftSecondary = BrowseSubAdminDraft;

type PolicyWriteRow = BrowseScopeAdminWriteRow;

const CAT_TABS: Array<{ id: CatTab; labelKo: string; labelEn: string }> = [
  { id: "basic", labelKo: "기본", labelEn: "Basic" },
  { id: "shelf", labelKo: "탐색 선반", labelEn: "Discovery shelf" },
  { id: "ad", labelKo: "광고(네이티브·배너)", labelEn: "Ads (native · banner)" },
  { id: "coupon", labelKo: "쿠폰 배지 허용", labelEn: "Allow coupon badges" },
  { id: "exposure", labelKo: "네이티브 광고 간격·최대", labelEn: "Native ad interval · max" },
  { id: "hours", labelKo: "업종 노출 기간", labelEn: "Category exposure period" },
];

/** CP-01 — 상단 칩 → 하위 탭 (`basic` 칩 문구는 현재 표시명). */
export const CATEGORY_POLICY_CHIP_TABS: ReadonlyArray<{ tab: CatTab; labelKo: string; labelEn: string }> = [
  { tab: "basic", labelKo: "기본", labelEn: "Basic" },
  { tab: "ad", labelKo: "광고 슬롯", labelEn: "Ad slot" },
  { tab: "coupon", labelKo: "쿠폰 배지", labelEn: "Coupon badge" },
  { tab: "exposure", labelKo: "노출 간격", labelEn: "Interval" },
];

function label(ko: boolean, koText: string, enText: string) {
  return ko ? koText : enText;
}

function asTier(raw: string | null): TierFocus {
  return raw === "secondary" ? "secondary" : "primary";
}

/** P-03 — 어드민 입력·표시 = 필리핀 시간(Asia/Manila), 저장 = ISO instant (launch-intro 와 같은 SSOT). */
function toInputDateTime(value: string | null | undefined): string {
  if (!value || value === "inherit") return "";
  if (!Number.isFinite(Date.parse(value))) return value.slice(0, 16);
  return isoToManilaLocal(value);
}

function inputDateTimeToPayload(value: string): string | null {
  return manilaLocalToIso(value.trim()) ?? null;
}

function clonePrimary(draft: DraftPrimary): DraftPrimary {
  return { ...draft };
}

function cloneSubs(drafts: Record<string, DraftSecondary>): Record<string, DraftSecondary> {
  const next: Record<string, DraftSecondary> = {};
  for (const [key, value] of Object.entries(drafts)) next[key] = { ...value };
  return next;
}

function boolTriState(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

function primaryDraftFrom(row: PrimaryRow): DraftPrimary {
  const scheduleStart = row.resolved.scheduleStart;
  const scheduleEnd = row.resolved.scheduleEnd;
  return {
    enabled: row.resolved.enabled,
    draftTitleKo: row.resolved.displayTitleKo ?? row.nameKo,
    draftTitleEn: row.resolved.displayTitleEn ?? row.nameEn,
    adEnabled: row.resolved.adEnabled,
    bannerAdsEnabled: row.resolved.bannerAds.enabled,
    bannerAdsCapacity: String(row.resolved.bannerAds.capacity),
    couponEnabled: row.resolved.couponEnabled,
    draftMax: row.resolved.maxInsertion == null ? "" : String(row.resolved.maxInsertion),
    draftInterval: row.row?.intervalEveryN != null && row.row.intervalEveryN !== "inherit" ? String(row.row.intervalEveryN) : "",
    scheduleMode: scheduleStart || scheduleEnd ? "scheduled" : "always",
    draftScheduleStart: toInputDateTime(scheduleStart),
    draftScheduleEnd: toInputDateTime(scheduleEnd),
    defaultSort: row.resolved.defaultSort,
    popularityWindowDays: row.resolved.popularityWindowDays,
    rankingCriteria: resolveStoresBrowseRankingCriteria(row.resolved.rankingCriteria),
    customerSortAvailability: resolveStoresBrowseCustomerSortAvailability(row.resolved.customerSortAvailability),
    discoveryShelf: {
      ...row.resolved.discoveryShelf,
      exposurePrimarySlugs:
        row.resolved.discoveryShelf.exposurePrimarySlugs.length > 0
          ? row.resolved.discoveryShelf.exposurePrimarySlugs
          : [row.primarySlug],
    },
  };
}

function secondaryDraftFrom(row: SecondaryRow): DraftSecondary {
  return browseSubAdminDraftFrom({ nameKo: row.nameKo, nameEn: row.nameEn, row: row.row, resolved: row.resolved });
}

function statusBadge(enabled: boolean, ko: boolean) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${
        enabled ? "bg-sam-success-soft text-sam-success" : "bg-sam-surface-muted text-sam-muted"
      }`}
    >
      {enabled ? label(ko, "사용", "On") : label(ko, "비활성", "Off")}
    </span>
  );
}

function Panel({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-ui-rect border border-sam-border bg-white p-4">
      <div className="mb-3">
        <h3 className="text-[14px] font-bold text-sam-fg">{title}</h3>
        {desc ? <p className="mt-0.5 text-[12px] text-sam-muted">{desc}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  labelText,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  labelText: string;
}) {
  return <AdminSwitch checked={checked} onChange={onChange} disabled={disabled} label={labelText} />;
}

function FieldLabel({
  labelText,
  children,
}: {
  labelText: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-[12px] font-semibold text-sam-muted">
      {labelText}
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-white px-3 py-2 text-[13px] text-sam-fg outline-none focus:border-sam-success focus:ring-2 focus:ring-sam-success"
    />
  );
}

function NumberInput({
  value,
  min,
  max,
  placeholder,
  onChange,
}: {
  value: string;
  min: number;
  max?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-white px-3 py-2 text-[13px] text-sam-fg outline-none focus:border-sam-success focus:ring-2 focus:ring-sam-success"
    />
  );
}

/** 기존 /admin/stores-category-policy 화면 — 편집기를 배달 CMS 셸에 담는다. */
export function AdminStoresCategoryPolicyPage() {
  return (
    <AdminDeliveryCmsChrome help="category">
      <AdminStoresCategoryPolicyEditor />
    </AdminDeliveryCmsChrome>
  );
}

/**
 * 5-F — 업종 목록 노출 정책 편집 본문. `/admin/stores-category-policy` 와 `/admin/delivery-screens?tab=browse` 공용.
 * 주소 쿼리(primary·tier·sub)는 현재 경로에 그대로 쓴다 (허브의 `tab` 쿼리 보존).
 */
export function AdminStoresCategoryPolicyEditor({
  embedded = false,
  onSaved,
}: {
  embedded?: boolean;
  /** 저장 성공 후 (허브 현황 새로고침용) */
  onSaved?: () => void;
} = {}) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/stores-category-policy";
  const searchParams = useSearchParams();
  const selectedPrimary = searchParams.get("primary")?.trim().toLowerCase() ?? "";
  const tier = asTier(searchParams.get("tier"));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errStatus, setErrStatus] = useState<number | undefined>(undefined);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [primaries, setPrimaries] = useState<PrimaryRow[]>([]);
  const [secondaries, setSecondaries] = useState<SecondaryRow[]>([]);
  const [draftPrimary, setDraftPrimary] = useState<DraftPrimary | null>(null);
  const [draftSubs, setDraftSubs] = useState<Record<string, DraftSecondary>>({});
  const [baselinePrimary, setBaselinePrimary] = useState<DraftPrimary | null>(null);
  const [baselineSubs, setBaselineSubs] = useState<Record<string, DraftSecondary>>({});
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [tab, setTab] = useState<CatTab>("basic");
  const [primaryModalOpen, setPrimaryModalOpen] = useState(false);
  const [secondaryModalOpen, setSecondaryModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingEnablePrimary, setPendingEnablePrimary] = useState<string | null>(null);
  const secondaryColumnRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const secondaryAutoOpenKey = useRef<string | null>(null);

  const replaceUrl = useCallback(
    (next: { primary?: string | null; tier?: TierFocus | null; sub?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.primary !== undefined) {
        if (next.primary) params.set("primary", next.primary);
        else params.delete("primary");
      }
      if (next.tier !== undefined) {
        if (next.tier && next.tier !== "primary") params.set("tier", next.tier);
        else params.delete("tier");
      }
      if (next.sub !== undefined) {
        if (next.sub) params.set("sub", next.sub);
        else params.delete("sub");
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setErrStatus(undefined);
    setSaveMsg(null);
    try {
      const qs = selectedPrimary ? `?primary=${encodeURIComponent(selectedPrimary)}` : "";
      const res = await fetch(`/api/admin/stores-category-policy${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        revision?: number;
        primaries?: PrimaryRow[];
        secondary?: SecondaryRow[];
      };
      if (!res.ok || !json.ok || !json.primaries) {
        setErr(res.status === 403 ? "forbidden" : json.error ?? "load_failed");
        setErrStatus(res.status);
        setRevision(null);
        setLoadedAt(null);
        setPrimaries([]);
        setSecondaries([]);
        setDraftPrimary(null);
        setDraftSubs({});
        return;
      }

      setRevision(typeof json.revision === "number" ? json.revision : 0);
      setLoadedAt(new Date().toISOString());
      setPrimaries(json.primaries);

      const secs = json.secondary ?? [];
      setSecondaries(secs);

      const primary = json.primaries.find((p) => p.primarySlug === selectedPrimary) ?? null;
      if (primary) {
        const nextPrimary = primaryDraftFrom(primary);
        setDraftPrimary(nextPrimary);
        setBaselinePrimary(clonePrimary(nextPrimary));
      } else {
        setDraftPrimary(null);
        setBaselinePrimary(null);
      }

      const nextSubs: Record<string, DraftSecondary> = {};
      for (const s of secs) nextSubs[s.subSlug] = secondaryDraftFrom(s);
      setDraftSubs(nextSubs);
      setBaselineSubs(cloneSubs(nextSubs));
      setSelectedSub((prev) => (prev && nextSubs[prev] ? prev : secs[0]?.subSlug ?? null));
    } catch {
      setErr("network_error");
      setErrStatus(undefined);
    } finally {
      setLoading(false);
    }
  }, [selectedPrimary]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedPrimary && primaries.length > 0 && !loading) {
      const firstEnabled = primaries.find((p) => p.resolved.enabled) ?? primaries[0];
      if (firstEnabled) replaceUrl({ primary: firstEnabled.primarySlug, tier: "primary" });
    }
  }, [loading, primaries, replaceUrl, selectedPrimary]);

  useEffect(() => {
    if (!pendingEnablePrimary || pendingEnablePrimary !== selectedPrimary || !draftPrimary) return;
    setDraftPrimary({ ...draftPrimary, enabled: true });
    setPendingEnablePrimary(null);
  }, [draftPrimary, pendingEnablePrimary, selectedPrimary]);

  /** CP-03 — 2차 패널을 열면 선택·스크롤만 한다 (상속 OFF 로 바꾸지 않는다 — 별도 설정은 운영자가 토글로만). */
  useEffect(() => {
    if (tier !== "secondary" || !selectedPrimary || secondaries.length === 0) return;
    const key = `${selectedPrimary}:${secondaries.map((s) => s.subSlug).join("|")}`;
    if (secondaryAutoOpenKey.current === key) return;
    secondaryAutoOpenKey.current = key;
    const first = secondaries.find((s) => s.row != null) ?? secondaries[0];
    if (!first) return;
    setSelectedSub((prev) => (prev && secondaries.some((s) => s.subSlug === prev) ? prev : first.subSlug));
    window.setTimeout(() => secondaryColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [secondaries, selectedPrimary, tier]);

  const primaryMeta = useMemo(
    () => primaries.find((p) => p.primarySlug === selectedPrimary) ?? null,
    [primaries, selectedPrimary]
  );

  const selectedSubMeta = useMemo(
    () => secondaries.find((s) => s.subSlug === selectedSub) ?? null,
    [secondaries, selectedSub]
  );

  const selectedSubDraft = selectedSub ? draftSubs[selectedSub] ?? null : null;

  const disabledPrimaries = useMemo(
    () => primaries.filter((p) => !p.resolved.enabled),
    [primaries]
  );

  const disabledSecondaries = useMemo(
    () => secondaries.filter((s) => !s.resolved.enabled),
    [secondaries]
  );

  const focusSecondary = useCallback(() => {
    replaceUrl({ primary: selectedPrimary || primaryMeta?.primarySlug || null, tier: "secondary" });
    window.setTimeout(() => secondaryColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [primaryMeta?.primarySlug, replaceUrl, selectedPrimary]);

  const selectPrimary = useCallback(
    (slug: string, nextTier: TierFocus = "primary") => {
      setTab("basic");
      setSelectedSub(null);
      replaceUrl({ primary: slug, tier: nextTier, sub: null });
    },
    [replaceUrl]
  );

  const updateSubDraft = useCallback(
    (slug: string, patch: Partial<DraftSecondary>, touched?: BrowseSubAdminToggleField) => {
      setDraftSubs((prev) => {
        const current = prev[slug];
        if (!current) return prev;
        const explicit = touched ? { ...current.explicit, [touched]: true as const } : current.explicit;
        return { ...prev, [slug]: { ...current, ...patch, explicit } };
      });
    },
    []
  );

  const onCancel = () => {
    if (baselinePrimary) setDraftPrimary(clonePrimary(baselinePrimary));
    setDraftSubs(cloneSubs(baselineSubs));
    setSaveMsg(null);
    setSaveErr(null);
  };

  const onSaveAll = async () => {
    if (!primaryMeta || !draftPrimary || revision == null) return;
    if (!isBrowseShelfSelectedSourceValid(draftPrimary.discoveryShelf)) {
      setSaveErr("selected_source_empty");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const rows: PolicyWriteRow[] = [
        {
          scopeKey: primaryMeta.scopeKey,
          primarySlug: primaryMeta.primarySlug,
          subSlug: null,
          enabled: draftPrimary.enabled,
          displayTitleKo: draftPrimary.draftTitleKo.trim() || primaryMeta.nameKo,
          displayTitleEn: draftPrimary.draftTitleEn.trim() || primaryMeta.nameEn,
          adEnabled: boolTriState(draftPrimary.adEnabled),
          couponEnabled: boolTriState(draftPrimary.couponEnabled),
          maxInsertion: nonNegativeIntOrNull(draftPrimary.draftMax),
          /** CP-04 — 빈칸 = null (플랫폼 기본값으로 해석, 8 을 저장하지 않는다). */
          intervalEveryN: positiveIntOrNull(draftPrimary.draftInterval),
          presentationMode: "card_benefit_integrated",
          scheduleStart:
            draftPrimary.scheduleMode === "scheduled" ? inputDateTimeToPayload(draftPrimary.draftScheduleStart) : null,
          scheduleEnd:
            draftPrimary.scheduleMode === "scheduled" ? inputDateTimeToPayload(draftPrimary.draftScheduleEnd) : null,
          /** CP-10 — 화면이 모르는 product_config 키는 보존 (기존 값에 병합). */
          productConfig: mergeBrowseProductConfig(primaryMeta.row?.productConfig ?? null, {
            popularityWindowDays: draftPrimary.popularityWindowDays,
            rankingCriteria: resolveStoresBrowseRankingCriteria(draftPrimary.rankingCriteria),
            customerSortAvailability: resolveStoresBrowseCustomerSortAvailability(
              draftPrimary.customerSortAvailability
            ),
            browseShelf: { ...draftPrimary.discoveryShelf },
            bannerAds: {
              enabled: draftPrimary.bannerAdsEnabled,
              position: "top_context",
              capacity: browseBannerCapacityForSave(draftPrimary.bannerAdsCapacity),
            },
          }),
        },
      ];
      const deleteScopeKeys: string[] = [];

      /** CP-04·CP-05 — 2차는 값이 있는 필드만 저장, 나머지 상속(null). 값이 없으면 행 삭제. */
      for (const secondary of secondaries) {
        const draft = draftSubs[secondary.subSlug];
        if (!draft) continue;
        const write = buildBrowseSubAdminWrite({
          scopeKey: secondary.scopeKey,
          primarySlug: primaryMeta.primarySlug,
          subSlug: secondary.subSlug,
          nameKo: secondary.nameKo,
          nameEn: secondary.nameEn,
          existingProductConfig: secondary.row?.productConfig ?? null,
          draft,
        });
        if (write.kind === "delete") {
          if (secondary.row != null || draft.mode === "inherit") deleteScopeKeys.push(secondary.scopeKey);
        } else {
          rows.push(write.row);
        }
      }

      const res = await fetch("/api/admin/stores-category-policy", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, rows, deleteScopeKeys }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error === "stale_revision" ? "stale_revision" : (json.error ?? "save_fail"));
        return;
      }
      if (typeof json.revision === "number") setRevision(json.revision);
      setPreviewReloadToken((n) => n + 1);
      await load();
      /** load() 가 시작 시 saveMsg 를 비우므로 재조회 뒤에 성공 배너를 띄운다. */
      setSaveMsg(label(ko, "저장되었습니다.", "Saved."));
      onSaved?.();
    } catch {
      setSaveErr("save_fail");
    } finally {
      setSaving(false);
    }
  };

  const reactivatePrimary = (slug: string) => {
    setPrimaryModalOpen(false);
    if (slug === selectedPrimary && draftPrimary) {
      setDraftPrimary({ ...draftPrimary, enabled: true });
      return;
    }
    setPendingEnablePrimary(slug);
    selectPrimary(slug, "primary");
  };

  const reactivateSecondary = (slug: string) => {
    const meta = secondaries.find((s) => s.subSlug === slug);
    setSecondaryModalOpen(false);
    if (!meta) return;
    setSelectedSub(slug);
    replaceUrl({ primary: selectedPrimary, tier: "secondary" });
    updateSubDraft(slug, {
      mode: "override",
      enabled: true,
      draftTitleKo: draftSubs[slug]?.draftTitleKo ?? meta.nameKo,
      draftTitleEn: draftSubs[slug]?.draftTitleEn ?? meta.nameEn,
    });
    window.setTimeout(() => secondaryColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const formattedLoadedAt = loadedAt
    ? formatAdminManilaDateTime(loadedAt)
    : label(ko, "아직 없음", "Not loaded");

  const previewTitle =
    tier === "secondary" && selectedSubMeta && selectedSubDraft
      ? selectedSubDraft.draftTitleKo.trim() ||
        (ko ? selectedSubMeta.nameKo : selectedSubMeta.nameEn)
      : draftPrimary?.draftTitleKo.trim() ||
        (primaryMeta ? (ko ? primaryMeta.nameKo : primaryMeta.nameEn) : label(ko, "카테고리", "Category"));

  const previewSubSlug =
    tier === "secondary" && selectedSub ? selectedSub : "all";

  const previewScopeBreadcrumb = useMemo(() => {
    if (!primaryMeta) return "";
    const primaryName = ko ? primaryMeta.nameKo : primaryMeta.nameEn;
    if (previewSubSlug === "all") {
      return ko
        ? `${primaryName} › 전체(1차 혼합) — 다른 1차 업종 매장 미포함`
        : `${primaryName} › all (primary mix) — other primaries excluded`;
    }
    const subName = selectedSubMeta
      ? ko
        ? selectedSubMeta.nameKo
        : selectedSubMeta.nameEn
      : previewSubSlug;
    return ko
      ? `${primaryName} › ${subName} — 해당 2차만 (예: 식당·한식 ≠ 마트)`
      : `${primaryName} › ${subName} — secondary only (e.g. restaurant·korean ≠ mart)`;
  }, [primaryMeta, previewSubSlug, selectedSubMeta, ko]);

  const previewDraftEnabled =
    tier === "secondary" && selectedSubDraft
      ? selectedSubDraft.mode === "inherit"
        ? (draftPrimary?.enabled ?? true)
        : selectedSubDraft.enabled
      : (draftPrimary?.enabled ?? true);

  const renderPrimaryTab = () => {
    if (!draftPrimary || !primaryMeta) return null;
    switch (tab) {
      case "basic":
        return (
          <Panel
            title={label(ko, "기본 설정", "Basic settings")}
            desc={label(
              ko,
              "고객에게 보이는 제목과 1차 업종 상태를 관리합니다. 중간 리스트는 이 1차(및 선택한 2차) 스코프 매장만 나옵니다 — HOME 선반·다른 업종과 섞이지 않습니다.",
              "Manage the customer-facing title and primary status. The mid-list shows only this primary (and selected secondary) — not HOME shelves or other industries."
            )}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <FieldLabel labelText={label(ko, "표시명(한국어)", "Display title (Korean)")}>
                <TextInput
                  value={draftPrimary.draftTitleKo}
                  maxLength={20}
                  onChange={(value) => setDraftPrimary({ ...draftPrimary, draftTitleKo: value })}
                />
              </FieldLabel>
              <FieldLabel labelText={label(ko, "표시명(English)", "Display title (English)")}>
                <TextInput
                  value={draftPrimary.draftTitleEn}
                  maxLength={36}
                  onChange={(value) => setDraftPrimary({ ...draftPrimary, draftTitleEn: value })}
                />
              </FieldLabel>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
              <div>
                <p className="text-[13px] font-bold text-sam-fg">{label(ko, "상태", "Status")}</p>
                <p className="text-[12px] text-sam-muted">
                  {label(ko, "OFF면 고객 화면에서 이 1차 업종이 숨겨집니다.", "When off, this primary category is hidden from customers.")}
                </p>
              </div>
              <Toggle
                checked={draftPrimary.enabled}
                labelText={label(ko, "1차 업종 활성 상태", "Primary enabled")}
                onChange={(enabled) => setDraftPrimary({ ...draftPrimary, enabled })}
              />
            </div>
            <div className="mt-3">
              <FieldLabel labelText={t("admin_stores_browse_ranking_criteria")}>
                <p className="mb-2 text-[12px] text-sam-muted">{t("admin_stores_browse_ranking_criteria_hint")}</p>
                <ul className="space-y-1">
                  {/* CP-08 — 선택한 기준을 적용 순서대로 위에, 미선택은 아래에 그린다 (↑↓ 가 행 위치를 바꾼다). */}
                  {[
                    ...draftPrimary.rankingCriteria,
                    ...STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS.filter((x) => !draftPrimary.rankingCriteria.includes(x)),
                  ].map((id) => {
                    const selected = draftPrimary.rankingCriteria.includes(id);
                    const index = draftPrimary.rankingCriteria.indexOf(id);
                    return (
                      <li key={id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected}
                          aria-label={t(`admin_stores_browse_criterion_${id}`)}
                          onChange={() => {
                            if (selected) {
                              if (draftPrimary.rankingCriteria.length <= 1) return;
                              setDraftPrimary({
                                ...draftPrimary,
                                rankingCriteria: draftPrimary.rankingCriteria.filter((x) => x !== id),
                              });
                              return;
                            }
                            setDraftPrimary({
                              ...draftPrimary,
                              rankingCriteria: [...draftPrimary.rankingCriteria, id],
                            });
                          }}
                        />
                        <span className="w-5 text-[12px] text-sam-muted">{selected ? `${index + 1}.` : ""}</span>
                        <span className="flex-1 text-[13px]">{t(`admin_stores_browse_criterion_${id}`)}</span>
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          aria-label={label(ko, "위로", "Move up")}
                          disabled={!selected || index <= 0}
                          onClick={() => {
                            const next = [...draftPrimary.rankingCriteria];
                            const swap = next[index - 1];
                            next[index - 1] = next[index];
                            next[index] = swap;
                            setDraftPrimary({ ...draftPrimary, rankingCriteria: next });
                          }}
                        >
                          ↑
                        </AdminActionButton>
                        <AdminActionButton
                          variant="secondary"
                          size="sm"
                          aria-label={label(ko, "아래로", "Move down")}
                          disabled={!selected || index < 0 || index >= draftPrimary.rankingCriteria.length - 1}
                          onClick={() => {
                            const next = [...draftPrimary.rankingCriteria];
                            const swap = next[index + 1];
                            next[index + 1] = next[index];
                            next[index] = swap;
                            setDraftPrimary({ ...draftPrimary, rankingCriteria: next });
                          }}
                        >
                          ↓
                        </AdminActionButton>
                      </li>
                    );
                  })}
                </ul>
              </FieldLabel>
            </div>
            <div className="mt-3">
              <p className="text-[12px] font-bold text-sam-fg">{t("admin_stores_browse_customer_sort")}</p>
              <p className="mb-2 text-[12px] text-sam-muted">{t("admin_stores_browse_customer_sort_hint")}</p>
              {(["popular", "rating", "distance"] as const).map((id) => (
                <div key={id} className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
                  <span className="text-[12px] font-bold">{t(`admin_stores_browse_customer_sort_${id}`)}</span>
                  <Toggle
                    checked={draftPrimary.customerSortAvailability[id]}
                    labelText={t(`admin_stores_browse_customer_sort_${id}`)}
                    onChange={(on) =>
                      setDraftPrimary({
                        ...draftPrimary,
                        customerSortAvailability: { ...draftPrimary.customerSortAvailability, [id]: on },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <AdminListItemButton
              className="mt-3 border border-sam-border bg-sam-surface-muted px-3 text-[12px] text-sam-fg"
              onClick={() => setTab("shelf")}
            >
              {t("admin_stores_browse_discovery_basic_pointer")}
            </AdminListItemButton>
            <div className="mt-3">
              <FieldLabel labelText={t("admin_stores_browse_order_axis_window")}>
                <select
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                  value={draftPrimary.popularityWindowDays}
                  onChange={(e) =>
                    setDraftPrimary({
                      ...draftPrimary,
                      popularityWindowDays: resolvePopularityWindowDays(Number(e.target.value)),
                    })
                  }
                >
                  {STORES_POPULARITY_WINDOW_DAYS_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(`admin_stores_popularity_window_${id}`)}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              {(() => {
                const meta = buildStorePopularityWindowMeta(draftPrimary.popularityWindowDays);
                return (
                  <div className="mt-2 space-y-1 text-[12px] text-sam-muted">
                    <p>
                      {t("admin_stores_popularity_rolling")} · {t("admin_stores_popularity_tz")} ·{" "}
                      {t("admin_stores_popularity_metric")} · {t("admin_stores_popularity_column")}
                    </p>
                    <p>
                      {t("admin_stores_popularity_range")}: {meta.popularitySinceIso} ~ {meta.popularityUntilIso}
                    </p>
                    <p>{t("admin_stores_popularity_window_limitation")}</p>
                  </div>
                );
              })()}
            </div>
            <div className="mt-3 rounded-ui-rect bg-sam-surface-muted p-3">
              <p className="text-[12px] font-bold text-sam-fg">{label(ko, "정책 요약", "Policy summary")}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-sam-muted">{label(ko, "2차 업종", "Secondary")}</dt>
                <dd className="font-semibold text-sam-fg">{secondaries.length}</dd>
                <dt className="text-sam-muted">{t("admin_delivery_ads_browse_policy_enabled")}</dt>
                <dd className="font-semibold text-sam-fg">
                  {draftPrimary.adEnabled
                    ? t("admin_delivery_ads_home_policy_enabled_on")
                    : t("admin_delivery_ads_home_policy_enabled_off")}
                </dd>
                <dt className="text-sam-muted">{label(ko, "쿠폰", "Coupons")}</dt>
                <dd className="font-semibold text-sam-fg">{draftPrimary.couponEnabled ? "ON" : "OFF"}</dd>
                <dt className="text-sam-muted">{label(ko, "네이티브 광고 최대", "Native ad max")}</dt>
                <dd className="font-semibold text-sam-fg">
                  {draftPrimary.draftMax.trim() === "" ? "—" : draftPrimary.draftMax}
                </dd>
                <dt className="text-sam-muted">{label(ko, "네이티브 광고 간격", "Native ad interval")}</dt>
                <dd className="font-semibold text-sam-fg">
                  {t("admin_delivery_ads_browse_policy_interval").replace(
                    "{n}",
                    draftPrimary.draftInterval.trim() || label(ko, "기본 8", "default 8")
                  )}
                </dd>
              </dl>
            </div>
          </Panel>
        );
      case "shelf":
        return (
          <Panel
            title={t("admin_stores_browse_discovery_shelf")}
            desc={t("admin_stores_browse_discovery_shelf_hint")}
          >
            <p className="mb-3 text-[12px] leading-5 text-sam-fg">{t("admin_stores_browse_discovery_how")}</p>
            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
              <span className="text-[12px] font-bold">{t("admin_stores_browse_discovery_enabled")}</span>
              <Toggle
                checked={draftPrimary.discoveryShelf.enabled}
                labelText={t("admin_stores_browse_discovery_enabled")}
                onChange={(enabled) =>
                  setDraftPrimary({
                    ...draftPrimary,
                    discoveryShelf: { ...draftPrimary.discoveryShelf, enabled },
                  })
                }
              />
            </div>
            <p className="mt-3 text-[12px] font-bold text-sam-fg">{t("admin_stores_browse_discovery_exposure")}</p>
            <div className="mt-1 space-y-1">
              {primaries.map((p) => {
                const on = draftPrimary.discoveryShelf.exposurePrimarySlugs.includes(p.primarySlug);
                return (
                  <label key={p.primarySlug} className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={on}
                      onChange={() => {
                        const cur = draftPrimary.discoveryShelf.exposurePrimarySlugs;
                        const next = on
                          ? cur.filter((s) => s !== p.primarySlug)
                          : [...cur, p.primarySlug];
                        setDraftPrimary({
                          ...draftPrimary,
                          discoveryShelf: { ...draftPrimary.discoveryShelf, exposurePrimarySlugs: next },
                        });
                      }}
                    />
                    {ko ? p.nameKo : p.nameEn}
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] font-bold text-sam-fg">{t("admin_stores_browse_discovery_source")}</p>
            <div className="mt-1 space-y-1 text-[12px]">
              {(["current_primary", "selected", "all"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="browse-shelf-source-mode"
                    checked={draftPrimary.discoveryShelf.sourceMode === mode}
                    onChange={() =>
                      setDraftPrimary({
                        ...draftPrimary,
                        discoveryShelf: { ...draftPrimary.discoveryShelf, sourceMode: mode },
                      })
                    }
                  />
                  {t(`admin_stores_browse_discovery_source_${mode === "current_primary" ? "current" : mode}`)}
                </label>
              ))}
            </div>
            {/* CP-02 — 「현재 1차」 소스는 2차 페이지에서만 선반이 나온다 (1차 전체 목록에 같은 매장이 이미 있어 제외됨). */}
            <p className="mt-2 text-[12px] leading-5 text-sam-muted" data-browse-shelf-current-primary-contract="1">
              {label(
                ko,
                "「현재 1차」 소스 선반은 2차(세부 업종) 페이지에서만 나옵니다. 1차 전체 페이지에는 같은 1차 매장이 이미 목록에 있어 선반이 비게 됩니다.",
                "A 'current primary' shelf appears only on secondary pages. On the primary 'all' page those stores are already in the list, so the shelf is empty."
              )}
            </p>
            {draftPrimary.discoveryShelf.enabled &&
            (draftPrimary.discoveryShelf.sourceMode === "current_primary" ||
              (draftPrimary.discoveryShelf.sourceMode === "selected" &&
                draftPrimary.discoveryShelf.sourcePrimarySlugs.length > 0 &&
                draftPrimary.discoveryShelf.sourcePrimarySlugs.every((slug) => slug === selectedPrimary))) ? (
              <p
                className="mt-2 rounded-ui-rect bg-sam-warning-soft px-3 py-2 text-[12px] font-semibold text-sam-warning"
                data-browse-shelf-primary-all-warning="1"
              >
                {label(
                  ko,
                  "1차 전체 페이지에도 선반을 보이려면 「선택한 1차」로 다른 1차 업종을 고르세요. 지금 설정은 2차 페이지에서만 표시됩니다.",
                  "To show the shelf on the primary 'all' page too, choose 'selected primaries' with a different primary. The current setting shows only on secondary pages."
                )}
              </p>
            ) : null}
            {draftPrimary.discoveryShelf.sourceMode === "selected" ? (
              <div className="mt-2 space-y-1">
                {primaries.map((p) => {
                  const on = draftPrimary.discoveryShelf.sourcePrimarySlugs.includes(p.primarySlug);
                  return (
                    <label key={`src-${p.primarySlug}`} className="flex items-center gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={on}
                        onChange={() => {
                          const cur = draftPrimary.discoveryShelf.sourcePrimarySlugs;
                          const next = on
                            ? cur.filter((s) => s !== p.primarySlug)
                            : [...cur, p.primarySlug];
                          setDraftPrimary({
                            ...draftPrimary,
                            discoveryShelf: { ...draftPrimary.discoveryShelf, sourcePrimarySlugs: next },
                          });
                        }}
                      />
                      {ko ? p.nameKo : p.nameEn}
                    </label>
                  );
                })}
              </div>
            ) : null}
            <FieldLabel labelText={t("admin_stores_browse_discovery_data")}>
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                value={draftPrimary.discoveryShelf.dataType}
                onChange={(e) =>
                  setDraftPrimary({
                    ...draftPrimary,
                    discoveryShelf: {
                      ...draftPrimary.discoveryShelf,
                      dataType: e.target.value as typeof draftPrimary.discoveryShelf.dataType,
                    },
                  })
                }
              >
                <option value="recommended">{t("admin_stores_browse_discovery_data_recommended")}</option>
                <option value="popular">{t("admin_stores_browse_discovery_data_popular")}</option>
                <option value="rating">{t("admin_stores_browse_discovery_data_rating")}</option>
                <option value="new_store">{t("admin_stores_browse_discovery_data_new_store")}</option>
              </select>
            </FieldLabel>
            <p className="mt-2 text-[12px] text-sam-muted">{t("admin_stores_browse_discovery_card_fixed")}</p>
            <FieldLabel labelText={t("admin_stores_browse_discovery_position")}>
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                value={draftPrimary.discoveryShelf.position}
                onChange={(e) =>
                  setDraftPrimary({
                    ...draftPrimary,
                    discoveryShelf: {
                      ...draftPrimary.discoveryShelf,
                      position: e.target.value as typeof draftPrimary.discoveryShelf.position,
                    },
                  })
                }
              >
                <option value="inline_after_n">{t("admin_stores_browse_discovery_position_inline")}</option>
                <option value="page_end">{t("admin_stores_browse_discovery_position_end")}</option>
                <option value="page_top">{t("admin_stores_browse_discovery_position_top")}</option>
                <option value="repeat_every_n">{t("admin_stores_browse_discovery_position_repeat")}</option>
              </select>
            </FieldLabel>
            {draftPrimary.discoveryShelf.position === "inline_after_n" ? (
              <div className="mt-2">
                <FieldLabel labelText={t("admin_stores_browse_discovery_after_n")}>
                  <NumberInput
                    min={1}
                    value={String(draftPrimary.discoveryShelf.afterN)}
                    onChange={(v) =>
                      setDraftPrimary({
                        ...draftPrimary,
                        discoveryShelf: {
                          ...draftPrimary.discoveryShelf,
                          afterN: Math.max(1, Math.floor(Number(v) || 1)),
                        },
                      })
                    }
                  />
                </FieldLabel>
              </div>
            ) : null}
            {draftPrimary.discoveryShelf.position === "repeat_every_n" ? (
              <div className="mt-2 space-y-2">
                <FieldLabel labelText={t("admin_stores_browse_discovery_every_n")}>
                  <NumberInput
                    min={1}
                    value={String(draftPrimary.discoveryShelf.everyN)}
                    onChange={(v) =>
                      setDraftPrimary({
                        ...draftPrimary,
                        discoveryShelf: {
                          ...draftPrimary.discoveryShelf,
                          everyN: Math.max(1, Math.floor(Number(v) || 1)),
                        },
                      })
                    }
                  />
                </FieldLabel>
                <FieldLabel labelText={t("admin_stores_browse_discovery_max_shelves")}>
                  <NumberInput
                    min={1}
                    value={String(draftPrimary.discoveryShelf.maxShelvesPerPage)}
                    onChange={(v) =>
                      setDraftPrimary({
                        ...draftPrimary,
                        discoveryShelf: {
                          ...draftPrimary.discoveryShelf,
                          maxShelvesPerPage: Math.max(1, Math.floor(Number(v) || 1)),
                        },
                      })
                    }
                  />
                </FieldLabel>
              </div>
            ) : null}
            {draftPrimary.discoveryShelf.sourceMode === "selected" &&
            draftPrimary.discoveryShelf.sourcePrimarySlugs.length === 0 ? (
              <p className="mt-2 text-[12px] font-semibold text-sam-danger">
                {t("admin_stores_browse_discovery_selected_empty")}
              </p>
            ) : null}
            <div className="mt-2">
              <FieldLabel labelText={t("admin_stores_browse_discovery_max")}>
                <NumberInput
                  min={1}
                  value={String(draftPrimary.discoveryShelf.maxItems)}
                  onChange={(v) =>
                    setDraftPrimary({
                      ...draftPrimary,
                      discoveryShelf: {
                        ...draftPrimary.discoveryShelf,
                        maxItems: Math.max(1, Math.floor(Number(v) || 1)),
                      },
                    })
                  }
                />
              </FieldLabel>
            </div>
          </Panel>
        );
      case "ad":
        if (!draftPrimary) return null;
        return (
          <Panel title={label(ko, "광고 (네이티브 · 배너)", "Ads (native · banner)")}>
            {selectedPrimary ? (
              <div className="mb-3">
                <AdminDeliveryAdBrowsePolicyPanel
                  primarySlug={selectedPrimary}
                  subSlug={null}
                  adEnabled={draftPrimary.adEnabled}
                  maxInsertion={
                    draftPrimary.draftMax.trim() === ""
                      ? null
                      : Number(draftPrimary.draftMax)
                  }
                  intervalEveryN={positiveIntOrNull(draftPrimary.draftInterval) ?? primaryMeta.resolved.intervalEveryN}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
              <div>
                <p className="text-[13px] font-bold">{label(ko, "네이티브 매장 홍보 허용", "Allow native store promotion")}</p>
                <p className="text-[12px] text-sam-muted">
                  {label(
                    ko,
                    "목록 카드 삽입(광고 라벨). 간격·최대는 「네이티브 광고 간격·최대」 탭. 배너와 별개입니다.",
                    "List card insertion with ad label. Interval/max on the native ad tab. Separate from banners."
                  )}
                </p>
              </div>
              <Toggle
                checked={draftPrimary.adEnabled}
                labelText={label(ko, "네이티브 매장 홍보 허용", "Allow native store promotion")}
                onChange={(adEnabled) => setDraftPrimary({ ...draftPrimary, adEnabled })}
              />
            </div>
            <div className="mt-3 space-y-3 rounded-ui-rect border border-dashed border-sam-border px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold">{label(ko, "업종 상단 배너 허용", "Allow category top banner")}</p>
                  <p className="text-[12px] text-sam-muted">
                    {label(
                      ko,
                      "이미지 배너 지면(top_context). 네이티브 삽입 플래너와 무관합니다.",
                      "Image banner slot (top_context). Independent of the native insertion planner."
                    )}
                  </p>
                </div>
                <Toggle
                  checked={draftPrimary.bannerAdsEnabled}
                  labelText={label(ko, "업종 상단 배너 허용", "Allow category top banner")}
                  onChange={(bannerAdsEnabled) =>
                    setDraftPrimary({ ...draftPrimary, bannerAdsEnabled })
                  }
                />
              </div>
              <FieldLabel labelText={label(ko, `배너 슬롯 용량 (1~${BROWSE_BANNER_CAPACITY_MAX})`, `Banner capacity (1–${BROWSE_BANNER_CAPACITY_MAX})`)}>
                <NumberInput
                  min={1}
                  max={BROWSE_BANNER_CAPACITY_MAX}
                  value={draftPrimary.bannerAdsCapacity}
                  onChange={(v) =>
                    setDraftPrimary({ ...draftPrimary, bannerAdsCapacity: clampBrowseBannerCapacityInput(v) })
                  }
                />
              </FieldLabel>
            </div>
          </Panel>
        );
      case "coupon":
        return (
          <Panel title={label(ko, "쿠폰 배지 허용", "Allow coupon badges")}>
            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
              <div>
                <p className="text-[13px] font-bold">{label(ko, "이 카테고리에서 유효한 쿠폰 배지 표시 허용", "Allow valid coupon badges in this category")}</p>
                <p className="text-[12px] text-sam-muted">{label(ko, "캠페인 생성은 「쿠폰」메뉴에서 합니다. 여기는 배지 표면 허용만 설정합니다.", "Create campaigns under Coupons. This toggles badge surface permission only.")}</p>
              </div>
              <Toggle
                checked={draftPrimary.couponEnabled}
                labelText={label(ko, "쿠폰 배지 허용", "Allow coupon badges")}
                onChange={(couponEnabled) => setDraftPrimary({ ...draftPrimary, couponEnabled })}
              />
            </div>
          </Panel>
        );
      case "exposure":
        return (
          <Panel
            title={label(ko, "네이티브 광고 간격·최대", "Native ad interval · max")}
            desc={label(
              ko,
              "목록 카드 사이에 넣는 네이티브 매장 광고에만 적용됩니다. 쿠폰 배지·상단 배너와는 무관합니다.",
              "Applies only to native store ads inserted between list cards — not coupon badges or the top banner."
            )}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <FieldLabel labelText={label(ko, "네이티브 광고 최대", "Native ad max")}>
                <NumberInput
                  min={0}
                  value={draftPrimary.draftMax}
                  placeholder={label(ko, "빈칸 = 제한 없음", "Blank = no limit")}
                  onChange={(draftMax) => setDraftPrimary({ ...draftPrimary, draftMax })}
                />
              </FieldLabel>
              <FieldLabel labelText={label(ko, "네이티브 광고 간격", "Native ad interval")}>
                <NumberInput
                  min={1}
                  value={draftPrimary.draftInterval}
                  placeholder={label(ko, "빈칸 = 기본 8", "Blank = default 8")}
                  onChange={(draftInterval) => setDraftPrimary({ ...draftPrimary, draftInterval })}
                />
              </FieldLabel>
            </div>
          </Panel>
        );
      case "hours":
        return (
          <Panel
            title={label(ko, "업종 노출 기간", "Category exposure period")}
            desc={label(
              ko,
              "이 업종이 고객 화면에 보이는 기간입니다 (매장 영업시간과 무관). 항상 노출은 기간을 비워 저장합니다.",
              "When this category is visible to customers (unrelated to store hours). Always on saves an empty period."
            )}
          >
            <div className="space-y-2">
              {(
                [
                  ["always", label(ko, "항상 노출", "Always on")],
                  ["scheduled", label(ko, "특정 기간", "Specific period")],
                ] as const
              ).map(([mode, text]) => (
                <label key={mode} className="flex items-center gap-2 rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] font-semibold">
                  <input
                    type="radio"
                    checked={draftPrimary.scheduleMode === mode}
                    onChange={() => setDraftPrimary({ ...draftPrimary, scheduleMode: mode })}
                  />
                  {text}
                </label>
              ))}
            </div>
            {draftPrimary.scheduleMode === "scheduled" ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <FieldLabel labelText={label(ko, "시작", "Start")}>
                  <input
                    type="datetime-local"
                    value={draftPrimary.draftScheduleStart}
                    onChange={(e) => setDraftPrimary({ ...draftPrimary, draftScheduleStart: e.target.value })}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                  />
                </FieldLabel>
                <FieldLabel labelText={label(ko, "종료", "End")}>
                  <input
                    type="datetime-local"
                    value={draftPrimary.draftScheduleEnd}
                    onChange={(e) => setDraftPrimary({ ...draftPrimary, draftScheduleEnd: e.target.value })}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                  />
                </FieldLabel>
              </div>
            ) : null}
          </Panel>
        );
      default:
        return null;
    }
  };

  return (
      <div className="space-y-3" data-admin-category-cms="mockup-rewrite">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {embedded ? (
            <div>
              <h2 className="text-[16px] font-bold text-sam-fg">{label(ko, "업종 목록 정책", "Category list policy")}</h2>
              <p className="mt-1 text-[12px] text-sam-muted">
                {label(ko, "1차 업종, 2차 상속, 광고/쿠폰/노출 정책을 한 번에 저장합니다.", "Save primary, secondary inheritance, ads, coupons, and exposure policy together.")}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[12px] font-semibold text-sam-success">
                {label(ko, "배달 CMS / 카테고리", "Delivery CMS / Category")}
              </p>
              {/* DEF-50: 제목 = 메뉴 라벨 키 (노출 정책) */}
              <h1 className="text-[20px] font-black tracking-tight text-sam-fg">{t("admin_menu_stores_browse_policy")}</h1>
              <p className="mt-1 text-[12px] text-sam-muted">
                {label(ko, "1차 업종, 2차 상속, 광고/쿠폰/노출 정책을 한 번에 저장합니다.", "Save primary, secondary inheritance, ads, coupons, and exposure policy together.")}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/advertising"
              className={Sam.btn.secondary}
              data-admin-delivery-ads-ops-cross-link="1"
            >
              {label(ko, "광고 운영 보기", "View ads operations")}
            </Link>
            <Link
              href={placementMapFocusHref("STORES_CATEGORY_FEED")}
              className={Sam.btn.secondary}
              data-admin-category-placement-map-link="1"
            >
              {label(ko, "앱에서 위치 보기", "View in app map")}
            </Link>
            <AdminActionButton variant="secondary" onClick={() => void load()} disabled={loading}>
              {adminCta("refresh", ko)}
            </AdminActionButton>
          </div>
        </div>

        <p
          className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning"
          data-admin-category-ads-boundary="1"
        >
          {label(
            ko,
            "카테고리 정책의광고 탭은 슬롯 밀도·허용(게이트)만 다룹니다. 유료 광고 신청·집행·일시중지는 「광고 운영」에서 하세요.",
            "Category policy Ad tabs control slot density/allowance only. Paid apply/execution/pause lives in Ads ops."
          )}
        </p>

        {saveMsg ? <p className="rounded-ui-rect bg-sam-success-soft px-3 py-2 text-[13px] font-semibold text-sam-success">{saveMsg}</p> : null}
        {saveErr ? (
          <p className="rounded-ui-rect bg-sam-danger-soft px-3 py-2 text-[13px] font-semibold text-sam-danger">
            {saveErr === "stale_revision"
              ? label(ko, "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 저장하세요.", "Another change was saved first. Reload and save again.")
              : saveErr === "selected_source_empty"
                ? t("admin_stores_browse_discovery_selected_empty")
              : label(ko, "저장에 실패했습니다.", "Failed to save.")}
          </p>
        ) : null}
        {err ? (
          <AdminErrorState ko={ko} code={err} httpStatus={errStatus} onRetry={() => void load()} />
        ) : null}

        {loading ? (
          <AdminLoadingState ko={ko} />
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(210px,240px)_minmax(0,1fr)_minmax(280px,320px)]">
            <aside className="rounded-ui-rect border border-sam-border bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-sam-border px-3 py-3">
                <div>
                  <p className="text-[13px] font-black text-sam-fg">{label(ko, "1차 업종", "Primary")}</p>
                  <p className="text-[12px] text-sam-muted">{label(ko, "플랫폼 taxonomy", "Platform taxonomy")}</p>
                </div>
                {/* 화면 primary 는 「전체 저장」 1개 — 추가·이동 버튼은 secondary */}
                <AdminActionButton variant="secondary" size="sm" onClick={() => setPrimaryModalOpen(true)}>
                  {label(ko, "+ 1차 업종 추가", "+ Add primary")}
                </AdminActionButton>
              </div>
              <ul className="max-h-[76vh] space-y-1 overflow-y-auto p-2">
                {primaries.map((primary) => {
                  const active = primary.primarySlug === selectedPrimary;
                  return (
                    <li key={primary.primarySlug}>
                      <AdminListItemButton
                        selected={active}
                        onClick={() => selectPrimary(primary.primarySlug, "primary")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-sam-fg">
                              {ko ? primary.nameKo : primary.nameEn}
                            </p>
                            <p className="mt-0.5 font-mono text-[12px] text-sam-muted">{primary.primarySlug}</p>
                          </div>
                          {statusBadge(primary.resolved.enabled, ko)}
                        </div>
                        {active ? (
                          <p className="mt-1 text-[12px] font-semibold text-sam-success">
                            {label(ko, `2차 ${secondaries.length}개`, `${secondaries.length} secondary`)}
                          </p>
                        ) : null}
                      </AdminListItemButton>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className={tier === "secondary" ? "space-y-3 opacity-90" : "space-y-3"}>
              {tier === "secondary" && selectedPrimary ? (
                <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2">
                  <p className="text-[12px] leading-5 text-sam-warning">{t("admin_stores_browse_discovery_not_ads")}</p>
                  <AdminActionButton
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      replaceUrl({ primary: selectedPrimary, tier: "primary" });
                      setTab("shelf");
                    }}
                  >
                    {t("admin_stores_browse_discovery_open_tab")}
                  </AdminActionButton>
                </div>
              ) : null}
              {!primaryMeta || !draftPrimary ? (
                <div className="rounded-ui-rect border border-sam-border bg-white p-8 text-center text-[13px] text-sam-muted">
                  {t("admin_stores_category_select_primary_hint")}
                </div>
              ) : (
                <>
                  <div className="rounded-ui-rect border border-sam-border bg-white">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sam-border px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[16px] font-black text-sam-fg">
                            {ko ? primaryMeta.nameKo : primaryMeta.nameEn}
                          </h2>
                          {statusBadge(draftPrimary.enabled, ko)}
                          <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 font-mono text-[12px] text-sam-muted">
                            {primaryMeta.scopeKey}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {label(ko, "헤더 미리보기는 가로 스크롤로 고객 칩 노출을 확인합니다.", "Use the horizontal preview to check customer chip exposure.")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AdminActionButton
                          variant="secondary"
                          onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                        >
                          {label(ko, "미리보기", "Preview")}
                        </AdminActionButton>
                        <AdminActionButton variant="secondary" onClick={() => setHistoryOpen((v) => !v)}>
                          {t("admin_r4c_history_title")}
                        </AdminActionButton>
                        <AdminActionButton variant="secondary" onClick={() => setDraftPrimary({ ...draftPrimary, enabled: false })}>
                          {label(ko, "비활성화", "Deactivate")}
                        </AdminActionButton>
                        <AdminActionButton variant="secondary" onClick={onCancel} disabled={saving}>
                          {adminCta("cancel", ko)}
                        </AdminActionButton>
                        <AdminActionButton variant="primary" disabled={saving} onClick={() => void onSaveAll()}>
                          {saving ? label(ko, "저장 중", "Saving") : adminCta("save", ko)}
                        </AdminActionButton>
                      </div>
                    </div>

                    {/* CP-01 — 상단 칩 = 하위 탭 이동 버튼 (제목→기본 · 광고 슬롯→광고 · 쿠폰 배지→쿠폰 · 노출 간격→네이티브 광고 간격) */}
                    <div ref={previewRef} className="overflow-x-auto border-b border-sam-border px-4 py-3">
                      <div className="flex min-w-max gap-2" data-category-policy-tab-chips="1">
                        {CATEGORY_POLICY_CHIP_TABS.map((chip) => (
                          <AdminActionButton
                            key={chip.tab}
                            variant={tab === chip.tab ? "primary" : "secondary"}
                            size="sm"
                            aria-pressed={tab === chip.tab}
                            data-category-policy-chip={chip.tab}
                            onClick={() => setTab(chip.tab)}
                          >
                            {chip.tab === "basic" ? previewTitle : ko ? chip.labelKo : chip.labelEn}
                          </AdminActionButton>
                        ))}
                      </div>
                    </div>

                    {historyOpen ? (
                      // DEF-45: 「변경 이력」 = 감사 기록 (변경자·시각·사유·이전/이후). 버전 번호는 기술 정보로만.
                      <div className="border-b border-sam-border bg-sam-surface-muted px-4 py-3">
                        <AdminConfigAuditHistoryPanel scope="browse_policy" limit={30} refreshToken={revision ?? 0} />
                        <AdminTechDetails ko={ko}>
                          revision {revision ?? "-"} · {formattedLoadedAt}
                        </AdminTechDetails>
                      </div>
                    ) : null}

                    <div className="px-3 pt-2">
                      <AdminTabs
                        tabs={CAT_TABS.map((item) => ({ id: item.id, label: ko ? item.labelKo : item.labelEn }))}
                        ariaLabel={label(ko, "업종 설정", "Category settings")}
                        value={tab}
                        onChange={(id) => setTab(id as CatTab)}
                        syncUrl={false}
                      />
                    </div>

                    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_270px]">
                      <div>{renderPrimaryTab()}</div>
                      <aside className="rounded-ui-rect border border-sam-border bg-sam-surface-muted p-3">
                        <p className="mb-1 text-center text-[12px] font-black text-sam-fg">
                          {label(ko, "고객 화면 미리보기", "Customer preview")}
                        </p>
                        <p className="mb-2 text-center text-[12px] text-sam-muted">
                          {label(
                            ko,
                            "카테고리=메뉴(업종) 위주. 목록은 선택 1·2차 스코프만.",
                            "Category is menu/industry-led. List = selected 1st/2nd scope only."
                          )}
                        </p>
                        {selectedPrimary ? (
                          <AdminStoresCategoryBrowseLivePreview
                            primarySlug={selectedPrimary}
                            subSlug={previewSubSlug}
                            scopeLabel={previewTitle}
                            scopeBreadcrumb={previewScopeBreadcrumb}
                            draftEnabled={previewDraftEnabled}
                            ko={ko}
                            reloadToken={previewReloadToken}
                          />
                        ) : null}
                      </aside>
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside
              ref={secondaryColumnRef}
              className={`rounded-ui-rect border bg-white ${
                tier === "secondary" ? "border-sam-success shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" : "border-sam-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-sam-border px-3 py-3">
                <div>
                  <p className="text-[13px] font-black text-sam-fg">{label(ko, "2차 업종", "Secondary")}</p>
                  <p className="text-[12px] text-sam-muted">
                    {label(ko, `전체 ${secondaries.length}개`, `${secondaries.length} total`)}
                  </p>
                </div>
                <AdminActionButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setSecondaryModalOpen(true)}
                  disabled={!selectedPrimary}
                >
                  {label(ko, "+ 2차 업종 추가", "+ Add secondary")}
                </AdminActionButton>
              </div>

              {!selectedPrimary ? (
                <p className="p-3 text-[12px] text-sam-muted">{t("admin_stores_category_select_primary_hint")}</p>
              ) : (
                <>
                  <ul className="max-h-[42vh] space-y-1 overflow-y-auto p-2">
                    {secondaries.map((secondary) => {
                      const draft = draftSubs[secondary.subSlug];
                      const active = selectedSub === secondary.subSlug;
                      const inherit = draft?.mode !== "override";
                      return (
                        <li key={secondary.subSlug} className="flex items-start gap-2">
                          {/* CP-12 — 상속 토글은 행 버튼 밖 형제 요소 (버튼 안 버튼 금지) */}
                          <AdminListItemButton
                            className="min-w-0 flex-1"
                            selected={active}
                            onClick={() => {
                              setSelectedSub(secondary.subSlug);
                              replaceUrl({ primary: selectedPrimary, tier: "secondary" });
                            }}
                          >
                            <p className="truncate text-[13px] font-bold text-sam-fg">
                              {ko ? secondary.nameKo : secondary.nameEn}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <span
                                className={`rounded-ui-rect px-1.5 py-0.5 text-[12px] font-bold ${
                                  inherit ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-warning-soft text-sam-warning"
                                }`}
                              >
                                {inherit
                                  ? label(
                                      ko,
                                      `${primaryMeta?.nameKo ?? "1차"} 기본값 사용`,
                                      `Uses ${primaryMeta?.nameEn ?? "primary"} defaults`
                                    )
                                  : label(ko, "별도 설정 있음", "Custom settings")}
                              </span>
                              {statusBadge(draft?.enabled ?? secondary.resolved.enabled, ko)}
                            </div>
                          </AdminListItemButton>
                          <div className="shrink-0 pt-2" data-category-sub-inherit-toggle={secondary.subSlug}>
                            <Toggle
                              checked={inherit}
                              labelText={label(ko, "상속 사용", "Use inheritance")}
                              onChange={(nextInherit) => {
                                setSelectedSub(secondary.subSlug);
                                updateSubDraft(secondary.subSlug, { mode: nextInherit ? "inherit" : "override" });
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="border-t border-sam-border p-3">
                    {selectedSubMeta && selectedSubDraft ? (
                      selectedSubDraft.mode === "override" ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[12px] font-black text-sam-fg">
                              {ko ? selectedSubMeta.nameKo : selectedSubMeta.nameEn}
                            </p>
                            <p className="text-[12px] text-sam-warning">
                              {label(
                                ko,
                                "별도 설정 편집 중 — 바꾼 값만 저장되고 나머지는 1차를 따릅니다.",
                                "Editing custom settings — only changed values are saved; the rest follow the primary."
                              )}
                            </p>
                          </div>
                          <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
                            <span className="text-[12px] font-bold">{label(ko, "활성", "Enabled")}</span>
                            <Toggle
                              checked={selectedSubDraft.enabled}
                              labelText={label(ko, "2차 업종 활성", "Secondary enabled")}
                              onChange={(enabled) => updateSubDraft(selectedSubMeta.subSlug, { enabled })}
                            />
                          </div>
                          <FieldLabel labelText={label(ko, "표시명(한국어)", "Display title (Korean)")}>
                            <TextInput
                              value={selectedSubDraft.draftTitleKo}
                              maxLength={20}
                              onChange={(draftTitleKo) => updateSubDraft(selectedSubMeta.subSlug, { draftTitleKo })}
                            />
                          </FieldLabel>
                          <FieldLabel labelText={label(ko, "표시명(English)", "Display title (English)")}>
                            <TextInput
                              value={selectedSubDraft.draftTitleEn}
                              maxLength={36}
                              onChange={(draftTitleEn) => updateSubDraft(selectedSubMeta.subSlug, { draftTitleEn })}
                            />
                          </FieldLabel>
                          {(() => {
                            /** CP-04 — 바꾸지 않은 토글은 1차 값을 따른다 (저장 시 상속). */
                            const sub = selectedSubMeta.subSlug;
                            const ex = selectedSubDraft.explicit;
                            const adValue = ex.adEnabled ? selectedSubDraft.adEnabled : (draftPrimary?.adEnabled ?? selectedSubDraft.adEnabled);
                            const couponValue = ex.couponEnabled
                              ? selectedSubDraft.couponEnabled
                              : (draftPrimary?.couponEnabled ?? selectedSubDraft.couponEnabled);
                            const bannerValue = ex.bannerAds
                              ? selectedSubDraft.bannerAdsEnabled
                              : (draftPrimary?.bannerAdsEnabled ?? selectedSubDraft.bannerAdsEnabled);
                            const bannerCapacity = ex.bannerAds
                              ? selectedSubDraft.bannerAdsCapacity
                              : (draftPrimary?.bannerAdsCapacity ?? selectedSubDraft.bannerAdsCapacity);
                            const inheritNote = label(ko, "1차 상속", "Inherits primary");
                            return (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-2 py-2">
                                    <span className="text-[12px] font-bold">
                                      {label(ko, "네이티브", "Native")}
                                      {!ex.adEnabled ? <span className="block font-normal text-sam-muted">{inheritNote}</span> : null}
                                    </span>
                                    <Toggle
                                      checked={adValue}
                                      labelText={label(ko, "2차 네이티브 광고", "Secondary native ads")}
                                      onChange={(adEnabled) => updateSubDraft(sub, { adEnabled }, "adEnabled")}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-2 py-2">
                                    <span className="text-[12px] font-bold">
                                      {label(ko, "쿠폰", "Coupons")}
                                      {!ex.couponEnabled ? <span className="block font-normal text-sam-muted">{inheritNote}</span> : null}
                                    </span>
                                    <Toggle
                                      checked={couponValue}
                                      labelText={label(ko, "2차 쿠폰", "Secondary coupons")}
                                      onChange={(couponEnabled) => updateSubDraft(sub, { couponEnabled }, "couponEnabled")}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between rounded-ui-rect border border-dashed border-sam-border px-2 py-2">
                                  <span className="text-[12px] font-bold">
                                    {label(ko, "상단 배너", "Top banner")}
                                    {!ex.bannerAds ? <span className="block font-normal text-sam-muted">{inheritNote}</span> : null}
                                  </span>
                                  <Toggle
                                    checked={bannerValue}
                                    labelText={label(ko, "2차 상단 배너", "Secondary top banner")}
                                    onChange={(bannerAdsEnabled) =>
                                      updateSubDraft(sub, { bannerAdsEnabled, bannerAdsCapacity: bannerCapacity }, "bannerAds")
                                    }
                                  />
                                </div>
                                <FieldLabel
                                  labelText={label(ko, `배너 용량 (1~${BROWSE_BANNER_CAPACITY_MAX})`, `Banner capacity (1–${BROWSE_BANNER_CAPACITY_MAX})`)}
                                >
                                  <NumberInput
                                    min={1}
                                    max={BROWSE_BANNER_CAPACITY_MAX}
                                    value={bannerCapacity}
                                    onChange={(v) =>
                                      updateSubDraft(
                                        sub,
                                        { bannerAdsCapacity: clampBrowseBannerCapacityInput(v), bannerAdsEnabled: bannerValue },
                                        "bannerAds"
                                      )
                                    }
                                  />
                                </FieldLabel>
                                <div className="grid grid-cols-2 gap-2">
                                  <FieldLabel labelText={label(ko, "네이티브 광고 최대", "Native ad max")}>
                                    <NumberInput
                                      min={0}
                                      value={selectedSubDraft.draftMax}
                                      placeholder={label(
                                        ko,
                                        `1차 상속 (${draftPrimary?.draftMax.trim() || "제한 없음"})`,
                                        `Primary (${draftPrimary?.draftMax.trim() || "no limit"})`
                                      )}
                                      onChange={(draftMax) => updateSubDraft(sub, { draftMax })}
                                    />
                                  </FieldLabel>
                                  <FieldLabel labelText={label(ko, "네이티브 광고 간격", "Native ad interval")}>
                                    <NumberInput
                                      min={1}
                                      value={selectedSubDraft.draftInterval}
                                      placeholder={label(
                                        ko,
                                        `1차 상속 (${draftPrimary?.draftInterval.trim() || "8"})`,
                                        `Primary (${draftPrimary?.draftInterval.trim() || "8"})`
                                      )}
                                      onChange={(draftInterval) => updateSubDraft(sub, { draftInterval })}
                                    />
                                  </FieldLabel>
                                </div>
                              </>
                            );
                          })()}
                          <p className="text-[12px] text-sam-muted">{t("admin_stores_browse_secondary_inherits_list_policy")}</p>
                        </div>
                      ) : (
                        <div className="rounded-ui-rect bg-sam-surface-muted p-3 text-[12px] text-sam-muted">
                          {label(ko, "상속 ON 상태입니다. 토글을 끄면 개별 설정 패널이 열립니다.", "Inheritance is on. Turn it off to open the custom settings panel.")}
                        </div>
                      )
                    ) : (
                      <p className="text-[12px] text-sam-muted">{label(ko, "2차 업종을 선택하세요.", "Select a secondary category.")}</p>
                    )}
                  </div>

                  <div className="border-t border-sam-border p-3">
                    <AdminActionButton variant="secondary" className="w-full" onClick={focusSecondary}>
                      {label(ko, "2차 업종 전체 관리", "Manage all secondary")}
                    </AdminActionButton>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        <DibayDialog
          open={primaryModalOpen}
          onClose={() => setPrimaryModalOpen(false)}
          dismissible
          title={label(ko, "1차 업종 추가", "Add primary")}
          description={label(ko, "업종 taxonomy는 플랫폼 소유라 새 slug를 만들 수 없습니다. 비활성 1차 업종을 다시 사용할 수 있습니다.", "Taxonomy is platform-owned, so new slugs cannot be created here. You can re-enable inactive primaries.")}
          zIndexClass={OVERLAY_Z_CLASS.nested}
        >
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {disabledPrimaries.length === 0 ? (
              <p className="rounded-ui-rect bg-sam-surface-muted p-3 text-[13px] text-sam-muted">
                {label(ko, "다시 사용할 비활성 1차 업종이 없습니다.", "No inactive primaries are available.")}
              </p>
            ) : (
              disabledPrimaries.map((primary) => (
                <AdminListItemButton
                  key={primary.primarySlug}
                  onClick={() => reactivatePrimary(primary.primarySlug)}
                  className="flex items-center justify-between border border-sam-border px-3"
                >
                  <span>
                    <span className="block text-[13px] font-bold text-sam-fg">{ko ? primary.nameKo : primary.nameEn}</span>
                    <span className="font-mono text-[12px] text-sam-muted">{primary.primarySlug}</span>
                  </span>
                  <span className="text-[12px] font-bold text-sam-success">{label(ko, "다시 사용", "Re-enable")}</span>
                </AdminListItemButton>
              ))
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <DibayOverlayButton roleTone="secondary" onClick={() => setPrimaryModalOpen(false)}>
              {label(ko, "닫기", "Close")}
            </DibayOverlayButton>
          </div>
        </DibayDialog>

        <DibayDialog
          open={secondaryModalOpen}
          onClose={() => setSecondaryModalOpen(false)}
          dismissible
          title={label(ko, "2차 업종 추가", "Add secondary")}
          description={label(ko, "2차 taxonomy도 플랫폼 소유입니다. 현재 1차 업종 아래 비활성 2차 업종을 다시 사용할 수 있습니다.", "Secondary taxonomy is also platform-owned. Re-enable inactive secondaries under the current primary.")}
          zIndexClass={OVERLAY_Z_CLASS.nested}
        >
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {disabledSecondaries.length === 0 ? (
              <p className="rounded-ui-rect bg-sam-surface-muted p-3 text-[13px] text-sam-muted">
                {label(ko, "다시 사용할 비활성 2차 업종이 없습니다.", "No inactive secondaries are available.")}
              </p>
            ) : (
              disabledSecondaries.map((secondary) => (
                <AdminListItemButton
                  key={secondary.subSlug}
                  onClick={() => reactivateSecondary(secondary.subSlug)}
                  className="flex items-center justify-between border border-sam-border px-3"
                >
                  <span>
                    <span className="block text-[13px] font-bold text-sam-fg">{ko ? secondary.nameKo : secondary.nameEn}</span>
                    <span className="font-mono text-[12px] text-sam-muted">{secondary.subSlug}</span>
                  </span>
                  <span className="text-[12px] font-bold text-sam-success">{label(ko, "다시 사용", "Re-enable")}</span>
                </AdminListItemButton>
              ))
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <DibayOverlayButton roleTone="secondary" onClick={() => setSecondaryModalOpen(false)}>
              {label(ko, "닫기", "Close")}
            </DibayOverlayButton>
          </div>
        </DibayDialog>
      </div>
  );
}
