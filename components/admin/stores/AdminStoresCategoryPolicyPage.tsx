"use client";

/**
 * Delivery CMS — category policy editor.
 * Platform taxonomy stays fixed; this page only edits browse-scope presentation policy.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  STORES_BROWSE_DEFAULT_SORT_IDS,
  type StoresBrowseScopePolicyResolved,
  type StoresBrowseScopePolicyRow,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";
import {
  STORES_POPULARITY_WINDOW_DAYS_IDS,
  buildStorePopularityWindowMeta,
  resolvePopularityWindowDays,
} from "@/lib/stores/store-discovery-popular-store";
import { AdminStoresCategoryBrowseLivePreview } from "@/components/admin/stores/AdminStoresCategoryBrowseLivePreview";

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

type CatTab = "basic" | "ad" | "coupon" | "exposure" | "hours";
type TierFocus = "primary" | "secondary";
type ScheduleMode = "always" | "scheduled";

type DraftPrimary = {
  enabled: boolean;
  draftTitleKo: string;
  draftTitleEn: string;
  adEnabled: boolean;
  couponEnabled: boolean;
  draftMax: string;
  draftInterval: string;
  scheduleMode: ScheduleMode;
  draftScheduleStart: string;
  draftScheduleEnd: string;
  defaultSort: StoreBrowseServerSortId;
  popularityWindowDays: import("@/lib/stores/store-discovery-popular-store").StoresPopularityWindowDays;
};

type DraftSecondary = {
  mode: "inherit" | "override";
  enabled: boolean;
  draftTitleKo: string;
  draftTitleEn: string;
  adEnabled: boolean;
  couponEnabled: boolean;
  draftMax: string;
  draftInterval: string;
  defaultSort: StoreBrowseServerSortId | "inherit";
  popularityWindowDays: import("@/lib/stores/store-discovery-popular-store").StoresPopularityWindowDays | "inherit";
};

type PolicyWriteRow = {
  scopeKey: string;
  primarySlug: string;
  subSlug: string | null;
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: "inherit" | "true" | "false";
  couponEnabled: "inherit" | "true" | "false";
  maxInsertion: number | null;
  intervalEveryN: number | null;
  presentationMode: "inherit" | "card_benefit_integrated";
  scheduleStart: string | null;
  scheduleEnd: string | null;
  productConfig?: Record<string, unknown>;
};

const CAT_TABS: Array<{ id: CatTab; labelKo: string; labelEn: string }> = [
  { id: "basic", labelKo: "기본", labelEn: "Basic" },
  { id: "ad", labelKo: "매장 광고 허용", labelEn: "Allow store ads" },
  { id: "coupon", labelKo: "쿠폰 배지 허용", labelEn: "Allow coupon badges" },
  { id: "exposure", labelKo: "노출", labelEn: "Exposure" },
  { id: "hours", labelKo: "시간", labelEn: "Hours" },
];

function label(ko: boolean, koText: string, enText: string) {
  return ko ? koText : enText;
}

function asTier(raw: string | null): TierFocus {
  return raw === "secondary" ? "secondary" : "primary";
}

function toInputDateTime(value: string | null | undefined): string {
  if (!value || value === "inherit") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value.slice(0, 16);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
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

function nullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function intervalNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8;
}

function primaryDraftFrom(row: PrimaryRow): DraftPrimary {
  const scheduleStart = row.resolved.scheduleStart;
  const scheduleEnd = row.resolved.scheduleEnd;
  return {
    enabled: row.resolved.enabled,
    draftTitleKo: row.resolved.displayTitleKo ?? row.nameKo,
    draftTitleEn: row.resolved.displayTitleEn ?? row.nameEn,
    adEnabled: row.resolved.adEnabled,
    couponEnabled: row.resolved.couponEnabled,
    draftMax: row.resolved.maxInsertion == null ? "" : String(row.resolved.maxInsertion),
    draftInterval: String(row.resolved.intervalEveryN),
    scheduleMode: scheduleStart || scheduleEnd ? "scheduled" : "always",
    draftScheduleStart: toInputDateTime(scheduleStart),
    draftScheduleEnd: toInputDateTime(scheduleEnd),
    defaultSort: row.resolved.defaultSort,
    popularityWindowDays: row.resolved.popularityWindowDays,
  };
}

function secondaryDraftFrom(row: SecondaryRow): DraftSecondary {
  const hasOverride = row.row != null;
  return {
    mode: hasOverride ? "override" : "inherit",
    enabled: row.resolved.enabled,
    draftTitleKo: row.resolved.displayTitleKo ?? row.nameKo,
    draftTitleEn: row.resolved.displayTitleEn ?? row.nameEn,
    adEnabled: row.resolved.adEnabled,
    couponEnabled: row.resolved.couponEnabled,
    draftMax: row.resolved.maxInsertion == null ? "" : String(row.resolved.maxInsertion),
    draftInterval: String(row.resolved.intervalEveryN),
    defaultSort:
      row.row?.productConfig &&
      typeof row.row.productConfig === "object" &&
      "defaultSort" in row.row.productConfig
        ? row.resolved.defaultSort
        : "inherit",
    popularityWindowDays:
      row.row?.productConfig &&
      typeof row.row.productConfig === "object" &&
      "popularityWindowDays" in row.row.productConfig
        ? row.resolved.popularityWindowDays
        : "inherit",
  };
}

function statusBadge(enabled: boolean, ko: boolean) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
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
  return (
    <button
      type="button"
      role="switch"
      aria-label={labelText}
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-emerald-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
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
      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-white px-3 py-2 text-[13px] text-sam-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    />
  );
}

function NumberInput({
  value,
  min,
  onChange,
}: {
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-ui-rect border border-sam-border bg-white px-3 py-2 text-[13px] text-sam-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    />
  );
}

export function AdminStoresCategoryPolicyPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPrimary = searchParams.get("primary")?.trim().toLowerCase() ?? "";
  const tier = asTier(searchParams.get("tier"));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
      router.replace(`/admin/stores-category-policy${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
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
        setErr(json.error ?? "load_fail");
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
      setErr("load_fail");
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

  useEffect(() => {
    if (tier !== "secondary" || !selectedPrimary || secondaries.length === 0) return;
    const key = `${selectedPrimary}:${secondaries.map((s) => s.subSlug).join("|")}`;
    if (secondaryAutoOpenKey.current === key) return;
    secondaryAutoOpenKey.current = key;
    const first = secondaries.find((s) => draftSubs[s.subSlug]?.mode === "override") ?? secondaries[0];
    if (!first) return;
    setSelectedSub(first.subSlug);
    setDraftSubs((prev) => {
      const current = prev[first.subSlug];
      if (!current || current.mode === "override") return prev;
      return { ...prev, [first.subSlug]: { ...current, mode: "override" } };
    });
    window.setTimeout(() => secondaryColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [draftSubs, secondaries, selectedPrimary, tier]);

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

  const updateSubDraft = useCallback((slug: string, patch: Partial<DraftSecondary>) => {
    setDraftSubs((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      return { ...prev, [slug]: { ...current, ...patch } };
    });
  }, []);

  const onCancel = () => {
    if (baselinePrimary) setDraftPrimary(clonePrimary(baselinePrimary));
    setDraftSubs(cloneSubs(baselineSubs));
    setSaveMsg(null);
    setSaveErr(null);
  };

  const onSaveAll = async () => {
    if (!primaryMeta || !draftPrimary || revision == null) return;
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
          maxInsertion: nullableNumber(draftPrimary.draftMax),
          intervalEveryN: intervalNumber(draftPrimary.draftInterval),
          presentationMode: "card_benefit_integrated",
          scheduleStart: draftPrimary.scheduleMode === "scheduled" ? draftPrimary.draftScheduleStart || null : null,
          scheduleEnd: draftPrimary.scheduleMode === "scheduled" ? draftPrimary.draftScheduleEnd || null : null,
          productConfig: {
            defaultSort: draftPrimary.defaultSort,
            popularityWindowDays: draftPrimary.popularityWindowDays,
          },
        },
      ];
      const deleteScopeKeys: string[] = [];

      for (const secondary of secondaries) {
        const draft = draftSubs[secondary.subSlug];
        if (!draft) continue;
        if (draft.mode === "inherit") {
          /** Canonical inherit = no secondary row (delete stub if present). */
          deleteScopeKeys.push(secondary.scopeKey);
        } else {
          rows.push({
            scopeKey: secondary.scopeKey,
            primarySlug: primaryMeta.primarySlug,
            subSlug: secondary.subSlug,
            enabled: draft.enabled,
            displayTitleKo: draft.draftTitleKo.trim() || secondary.nameKo,
            displayTitleEn: draft.draftTitleEn.trim() || secondary.nameEn,
            adEnabled: boolTriState(draft.adEnabled),
            couponEnabled: boolTriState(draft.couponEnabled),
            maxInsertion: nullableNumber(draft.draftMax),
            intervalEveryN: intervalNumber(draft.draftInterval),
            presentationMode: "card_benefit_integrated",
            scheduleStart: null,
            scheduleEnd: null,
            productConfig: (() => {
              const cfg: Record<string, unknown> = {};
              if (draft.defaultSort !== "inherit") cfg.defaultSort = draft.defaultSort;
              if (draft.popularityWindowDays !== "inherit") {
                cfg.popularityWindowDays = draft.popularityWindowDays;
              }
              return cfg;
            })(),
          });
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
      setSaveMsg(label(ko, "저장되었습니다.", "Saved."));
      setPreviewReloadToken((n) => n + 1);
      await load();
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
    ? new Date(loadedAt).toLocaleString(ko ? "ko-KR" : "en-US")
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

  const previewAdEnabled =
    tier === "secondary" && selectedSubDraft?.mode === "override"
      ? selectedSubDraft.adEnabled
      : (draftPrimary?.adEnabled ?? false);

  const previewCouponEnabled =
    tier === "secondary" && selectedSubDraft?.mode === "override"
      ? selectedSubDraft.couponEnabled
      : (draftPrimary?.couponEnabled ?? false);

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
                <p className="text-[11px] text-sam-muted">
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
              <FieldLabel labelText={t("admin_stores_browse_default_sort")}>
                <select
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                  value={draftPrimary.defaultSort}
                  onChange={(e) =>
                    setDraftPrimary({
                      ...draftPrimary,
                      defaultSort: e.target.value as StoreBrowseServerSortId,
                    })
                  }
                >
                  {STORES_BROWSE_DEFAULT_SORT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id === "default" ? (ko ? "추천순" : "Recommended") : id}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            </div>
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
                  <div className="mt-2 space-y-1 text-[11px] text-sam-muted">
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
                <dt className="text-sam-muted">{label(ko, "광고", "Ads")}</dt>
                <dd className="font-semibold text-sam-fg">{draftPrimary.adEnabled ? "ON" : "OFF"}</dd>
                <dt className="text-sam-muted">{label(ko, "쿠폰", "Coupons")}</dt>
                <dd className="font-semibold text-sam-fg">{draftPrimary.couponEnabled ? "ON" : "OFF"}</dd>
                <dt className="text-sam-muted">{label(ko, "노출 간격", "Interval")}</dt>
                <dd className="font-semibold text-sam-fg">{draftPrimary.draftInterval || "8"}</dd>
              </dl>
            </div>
          </Panel>
        );
      case "ad":
        return (
          <Panel title={label(ko, "매장 광고 허용", "Allow store ads")}>
            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
              <div>
                <p className="text-[13px] font-bold">{label(ko, "이 카테고리에서 매장 광고 허용", "Allow store ads in this category")}</p>
                <p className="text-[11px] text-sam-muted">{label(ko, "캠페인 생성은 「매장 광고」메뉴에서 합니다. 여기는 표면 허용만 설정합니다.", "Create campaigns under Store ads. This toggles surface permission only.")}</p>
              </div>
              <Toggle
                checked={draftPrimary.adEnabled}
                labelText={label(ko, "매장 광고 허용", "Allow store ads")}
                onChange={(adEnabled) => setDraftPrimary({ ...draftPrimary, adEnabled })}
              />
            </div>
          </Panel>
        );
      case "coupon":
        return (
          <Panel title={label(ko, "쿠폰 배지 허용", "Allow coupon badges")}>
            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
              <div>
                <p className="text-[13px] font-bold">{label(ko, "이 카테고리에서 유효한 쿠폰 배지 표시 허용", "Allow valid coupon badges in this category")}</p>
                <p className="text-[11px] text-sam-muted">{label(ko, "캠페인 생성은 「쿠폰」메뉴에서 합니다. 여기는 배지 표면 허용만 설정합니다.", "Create campaigns under Coupons. This toggles badge surface permission only.")}</p>
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
          <Panel title={label(ko, "노출/정렬", "Exposure")}>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldLabel labelText={label(ko, "최대 삽입 수", "Max insertions")}>
                <NumberInput
                  min={0}
                  value={draftPrimary.draftMax}
                  onChange={(draftMax) => setDraftPrimary({ ...draftPrimary, draftMax })}
                />
              </FieldLabel>
              <FieldLabel labelText={label(ko, "삽입 간격", "Interval")}>
                <NumberInput
                  min={1}
                  value={draftPrimary.draftInterval}
                  onChange={(draftInterval) => setDraftPrimary({ ...draftPrimary, draftInterval })}
                />
              </FieldLabel>
            </div>
          </Panel>
        );
      case "hours":
        return (
          <Panel
            title={label(ko, "운영 시간", "Hours")}
            desc={label(ko, "항상 노출은 schedule을 null로 저장합니다.", "Always on persists schedule as null.")}
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
    <AdminDeliveryCmsChrome help="category">
      <div className="space-y-3" data-admin-category-cms="mockup-rewrite">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-emerald-700">
              {label(ko, "배달 CMS / 카테고리", "Delivery CMS / Category")}
            </p>
            <h1 className="text-[22px] font-black tracking-tight text-sam-fg">
              {label(ko, "카테고리 정책 관리", "Category Policy")}
            </h1>
            <p className="mt-1 text-[12px] text-sam-muted">
              {label(ko, "1차 업종, 2차 상속, 광고/쿠폰/노출 정책을 한 번에 저장합니다.", "Save primary, secondary inheritance, ads, coupons, and exposure policy together.")}
            </p>
          </div>
          <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
            {label(ko, "새로고침", "Reload")}
          </button>
        </div>

        {saveMsg ? <p className="rounded-ui-rect bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">{saveMsg}</p> : null}
        {saveErr ? (
          <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
            {saveErr === "stale_revision"
              ? label(ko, "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 저장하세요.", "Another change was saved first. Reload and save again.")
              : label(ko, "저장에 실패했습니다.", "Failed to save.")}
          </p>
        ) : null}
        {err ? (
          <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
            {label(ko, "불러오지 못했습니다.", "Failed to load.")} ({err})
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-ui-rect border border-sam-border bg-white p-6 text-[13px] text-sam-muted">
            {label(ko, "불러오는 중...", "Loading...")}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(210px,240px)_minmax(0,1fr)_minmax(280px,320px)]">
            <aside className="rounded-ui-rect border border-sam-border bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-sam-border px-3 py-3">
                <div>
                  <p className="text-[13px] font-black text-sam-fg">{label(ko, "1차 업종", "Primary")}</p>
                  <p className="text-[11px] text-sam-muted">{label(ko, "플랫폼 taxonomy", "Platform taxonomy")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPrimaryModalOpen(true)}
                  className="rounded-ui-rect bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                >
                  {label(ko, "+ 1차 업종 추가", "+ Add primary")}
                </button>
              </div>
              <ul className="max-h-[76vh] space-y-1 overflow-y-auto p-2">
                {primaries.map((primary) => {
                  const active = primary.primarySlug === selectedPrimary;
                  return (
                    <li key={primary.primarySlug}>
                      <button
                        type="button"
                        onClick={() => selectPrimary(primary.primarySlug, "primary")}
                        className={`w-full rounded-ui-rect px-2 py-2 text-left transition ${
                          active ? "bg-emerald-50 ring-1 ring-emerald-300" : "hover:bg-sam-surface-muted"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-sam-fg">
                              {ko ? primary.nameKo : primary.nameEn}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-sam-muted">{primary.primarySlug}</p>
                          </div>
                          {statusBadge(primary.resolved.enabled, ko)}
                        </div>
                        {active ? (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-800">
                            {label(ko, `2차 ${secondaries.length}개`, `${secondaries.length} secondary`)}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className={tier === "secondary" ? "space-y-3 opacity-90" : "space-y-3"}>
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
                          <h2 className="truncate text-[18px] font-black text-sam-fg">
                            {ko ? primaryMeta.nameKo : primaryMeta.nameEn}
                          </h2>
                          {statusBadge(draftPrimary.enabled, ko)}
                          <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 font-mono text-[10px] text-sam-muted">
                            {primaryMeta.scopeKey}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {label(ko, "헤더 미리보기는 가로 스크롤로 고객 칩 노출을 확인합니다.", "Use the horizontal preview to check customer chip exposure.")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={Sam.btn.secondary}
                          onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                        >
                          {label(ko, "미리보기", "Preview")}
                        </button>
                        <button type="button" className={Sam.btn.secondary} onClick={() => setHistoryOpen((v) => !v)}>
                          {label(ko, "변경 이력", "History")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftPrimary({ ...draftPrimary, enabled: false })}
                          className="rounded-ui-rect border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 hover:bg-red-50"
                        >
                          {label(ko, "비활성화", "Deactivate")}
                        </button>
                        <button type="button" className={Sam.btn.secondary} onClick={onCancel} disabled={saving}>
                          {label(ko, "취소", "Cancel")}
                        </button>
                        <button
                          type="button"
                          className="rounded-ui-rect bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                          disabled={saving}
                          onClick={() => void onSaveAll()}
                        >
                          {saving ? label(ko, "저장 중", "Saving") : label(ko, "저장", "Save")}
                        </button>
                      </div>
                    </div>

                    <div ref={previewRef} className="overflow-x-auto border-b border-sam-border px-4 py-3">
                      <div className="flex min-w-max gap-2">
                        {[previewTitle, label(ko, "광고 슬롯", "Ad slot"), label(ko, "쿠폰 배지", "Coupon badge"), label(ko, "노출 간격", "Interval")].map((item, idx) => (
                          <div
                            key={`${item}-${idx}`}
                            className={`rounded-ui-rect border px-3 py-2 text-[12px] font-bold ${
                              idx === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-sam-border bg-white text-sam-muted"
                            }`}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    {historyOpen ? (
                      <div className="border-b border-sam-border bg-sam-surface-muted px-4 py-3">
                        <p className="text-[12px] font-bold text-sam-fg">{label(ko, "최근 저장 정보", "Last save info")}</p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {label(ko, "로드된 revision", "Loaded revision")}: {revision ?? "-"} · {label(ko, "시각", "Timestamp")}: {formattedLoadedAt}
                        </p>
                      </div>
                    ) : null}

                    <div className="flex gap-1 overflow-x-auto border-b border-sam-border px-3 pt-2">
                      {CAT_TABS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTab(item.id)}
                          className={`shrink-0 rounded-t-ui-rect px-3 py-2 text-[12px] font-bold ${
                            tab === item.id
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                              : "text-sam-muted hover:text-sam-fg"
                          }`}
                        >
                          {ko ? item.labelKo : item.labelEn}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_270px]">
                      <div>{renderPrimaryTab()}</div>
                      <aside className="rounded-ui-rect border border-sam-border bg-sam-surface-muted p-3">
                        <p className="mb-1 text-center text-[12px] font-black text-sam-fg">
                          {label(ko, "고객 화면 미리보기", "Customer preview")}
                        </p>
                        <p className="mb-2 text-center text-[10px] text-sam-muted">
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
                            adEnabled={previewAdEnabled}
                            couponEnabled={previewCouponEnabled}
                            defaultSort={
                              tier === "secondary" && selectedSubDraft?.mode === "override" && selectedSubDraft.defaultSort !== "inherit"
                                ? selectedSubDraft.defaultSort
                                : draftPrimary.defaultSort
                            }
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
                tier === "secondary" ? "border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" : "border-sam-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-sam-border px-3 py-3">
                <div>
                  <p className="text-[13px] font-black text-sam-fg">{label(ko, "2차 업종", "Secondary")}</p>
                  <p className="text-[11px] text-sam-muted">
                    {label(ko, `전체 ${secondaries.length}개`, `${secondaries.length} total`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSecondaryModalOpen(true)}
                  disabled={!selectedPrimary}
                  className="rounded-ui-rect bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                >
                  {label(ko, "+ 2차 업종 추가", "+ Add secondary")}
                </button>
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
                        <li key={secondary.subSlug}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSub(secondary.subSlug);
                              replaceUrl({ primary: selectedPrimary, tier: "secondary" });
                            }}
                            className={`w-full rounded-ui-rect px-2 py-2 text-left ${
                              active ? "bg-emerald-50 ring-1 ring-emerald-300" : "hover:bg-sam-surface-muted"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-bold text-sam-fg">
                                  {ko ? secondary.nameKo : secondary.nameEn}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      inherit ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {inherit ? label(ko, "상속", "Inherit") : label(ko, "개별", "Custom")}
                                  </span>
                                  {statusBadge(draft?.enabled ?? secondary.resolved.enabled, ko)}
                                </div>
                              </div>
                              <Toggle
                                checked={inherit}
                                labelText={label(ko, "상속 사용", "Use inheritance")}
                                onChange={(nextInherit) =>
                                  updateSubDraft(secondary.subSlug, { mode: nextInherit ? "inherit" : "override" })
                                }
                              />
                            </div>
                          </button>
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
                            <p className="text-[11px] text-amber-700">
                              {label(ko, "개별 override 편집 중", "Editing custom override")}
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
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-2 py-2">
                              <span className="text-[12px] font-bold">{label(ko, "광고", "Ads")}</span>
                              <Toggle
                                checked={selectedSubDraft.adEnabled}
                                labelText={label(ko, "2차 광고", "Secondary ads")}
                                onChange={(adEnabled) => updateSubDraft(selectedSubMeta.subSlug, { adEnabled })}
                              />
                            </div>
                            <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-2 py-2">
                              <span className="text-[12px] font-bold">{label(ko, "쿠폰", "Coupons")}</span>
                              <Toggle
                                checked={selectedSubDraft.couponEnabled}
                                labelText={label(ko, "2차 쿠폰", "Secondary coupons")}
                                onChange={(couponEnabled) => updateSubDraft(selectedSubMeta.subSlug, { couponEnabled })}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <FieldLabel labelText={label(ko, "최대", "Max")}>
                              <NumberInput
                                min={0}
                                value={selectedSubDraft.draftMax}
                                onChange={(draftMax) => updateSubDraft(selectedSubMeta.subSlug, { draftMax })}
                              />
                            </FieldLabel>
                            <FieldLabel labelText={label(ko, "간격", "Interval")}>
                              <NumberInput
                                min={1}
                                value={selectedSubDraft.draftInterval}
                                onChange={(draftInterval) => updateSubDraft(selectedSubMeta.subSlug, { draftInterval })}
                              />
                            </FieldLabel>
                          </div>
                          <FieldLabel labelText={t("admin_stores_browse_default_sort")}>
                            <select
                              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                              value={selectedSubDraft.defaultSort}
                              onChange={(e) =>
                                updateSubDraft(selectedSubMeta.subSlug, {
                                  defaultSort: e.target.value as StoreBrowseServerSortId | "inherit",
                                })
                              }
                            >
                              <option value="inherit">{ko ? "1차 상속" : "Inherit primary"}</option>
                              {STORES_BROWSE_DEFAULT_SORT_IDS.map((id) => (
                                <option key={id} value={id}>
                                  {id === "default" ? (ko ? "추천순" : "Recommended") : id}
                                </option>
                              ))}
                            </select>
                          </FieldLabel>
                          <FieldLabel labelText={t("admin_stores_browse_order_axis_window")}>
                            <select
                              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                              value={selectedSubDraft.popularityWindowDays}
                              onChange={(e) =>
                                updateSubDraft(selectedSubMeta.subSlug, {
                                  popularityWindowDays:
                                    e.target.value === "inherit"
                                      ? "inherit"
                                      : resolvePopularityWindowDays(Number(e.target.value)),
                                })
                              }
                            >
                              <option value="inherit">{t("admin_stores_popularity_window_inherit")}</option>
                              {STORES_POPULARITY_WINDOW_DAYS_IDS.map((id) => (
                                <option key={id} value={id}>
                                  {t(`admin_stores_popularity_window_${id}`)}
                                </option>
                              ))}
                            </select>
                          </FieldLabel>
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
                    <button type="button" onClick={focusSecondary} className="w-full rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-black text-emerald-800">
                      {label(ko, "2차 업종 전체 관리", "Manage all secondary")}
                    </button>
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
                <button
                  key={primary.primarySlug}
                  type="button"
                  onClick={() => reactivatePrimary(primary.primarySlug)}
                  className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2 text-left hover:bg-emerald-50"
                >
                  <span>
                    <span className="block text-[13px] font-bold text-sam-fg">{ko ? primary.nameKo : primary.nameEn}</span>
                    <span className="font-mono text-[10px] text-sam-muted">{primary.primarySlug}</span>
                  </span>
                  <span className="text-[12px] font-bold text-emerald-700">{label(ko, "다시 사용", "Re-enable")}</span>
                </button>
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
                <button
                  key={secondary.subSlug}
                  type="button"
                  onClick={() => reactivateSecondary(secondary.subSlug)}
                  className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2 text-left hover:bg-emerald-50"
                >
                  <span>
                    <span className="block text-[13px] font-bold text-sam-fg">{ko ? secondary.nameKo : secondary.nameEn}</span>
                    <span className="font-mono text-[10px] text-sam-muted">{secondary.subSlug}</span>
                  </span>
                  <span className="text-[12px] font-bold text-emerald-700">{label(ko, "다시 사용", "Re-enable")}</span>
                </button>
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
    </AdminDeliveryCmsChrome>
  );
}
