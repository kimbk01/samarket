"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type {
  DeliveryDistancePolicy,
  DeliveryDistanceSource,
  DeliveryStoreDistanceMode,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import {
  formatStoreDeliveryRadiusKmForInput,
  parseStoreDeliveryRadiusKmForWrite,
  resolveEffectiveStoreDeliveryRadiusKm,
} from "@/lib/delivery/store-delivery-radius";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  adminConflictReloadedMessage,
  adminOperatorErrorMessage,
} from "@/lib/admin/operator-ux/operator-labels";
import { isAdminConflictErrorCode } from "@/lib/admin/concurrency/admin-expected-updated-at";

/** 코드 형태(snake_case)만 오류 코드로 사용 — 원문 메시지·HTTP 상태는 노출하지 않는다. */
function errCode(status: number, j: { error?: unknown } | null | undefined, fallback: string): string {
  const e = j?.error;
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

type StoreRow = {
  id: string;
  store_name?: string | null;
  slug?: string | null;
  approval_status?: string | null;
  is_visible?: boolean | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  formatted_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  delivery_radius_km?: number | null;
  updated_at?: string | null;
};

const DEFAULT_POLICY: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: null,
  overDistanceBehavior: "exclude",
};

/**
 * 매장 목록 = 서버 페이지 (`/api/admin/stores?page=&page_size=`) — 조건은 주소 (`q`·`page`·`size` 20/50/100, 기본 50).
 */
const STORE_LIST_CONFIG = { defaults: { size: 50 as const } };

const DEFAULT_OVERRIDES: DeliveryStoreDistanceOverrides = {
  stores: {},
};

function normalizePolicy(raw: unknown): DeliveryDistancePolicy {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source = o.source === "google" ? "google" : "straight";
  return {
    enabled: o.enabled === true,
    source,
    /** Preserved in JSON for compatibility — not edited as store radius. */
    defaultMaxKm:
      typeof o.defaultMaxKm === "number" && Number.isFinite(o.defaultMaxKm) && o.defaultMaxKm > 0
        ? Math.round(o.defaultMaxKm * 10) / 10
        : null,
    overDistanceBehavior: "exclude",
  };
}

function normalizeOverrides(raw: unknown): DeliveryStoreDistanceOverrides {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const storesRaw = o.stores && typeof o.stores === "object" ? (o.stores as Record<string, unknown>) : {};
  const stores: DeliveryStoreDistanceOverrides["stores"] = {};
  for (const [storeId, value] of Object.entries(storesRaw)) {
    if (!storeId.trim() || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const mode: DeliveryStoreDistanceMode =
      v.mode === "enabled" || v.mode === "disabled" ? v.mode : "inherit";
    /** Legacy maxKm ignored for radius — mode-only override remains. */
    if (mode === "inherit") continue;
    stores[storeId] = { mode, maxKm: null };
  }
  return { stores };
}

function distanceModeLabel(ko: boolean, mode: DeliveryStoreDistanceMode): string {
  if (mode === "enabled") return ko ? "허용" : "Allowed";
  if (mode === "disabled") return ko ? "차단" : "Blocked";
  return ko ? "전역 정책 따름" : "Follow global policy";
}

function modeOf(o: DeliveryStoreDistanceOverrides, storeId: string): DeliveryStoreDistanceMode {
  return o.stores[storeId]?.mode ?? "inherit";
}

function withStoreMode(
  o: DeliveryStoreDistanceOverrides,
  storeId: string,
  mode: DeliveryStoreDistanceMode
): DeliveryStoreDistanceOverrides {
  const storesNext = { ...o.stores };
  if (mode === "inherit") delete storesNext[storeId];
  else storesNext[storeId] = { mode, maxKm: null };
  return { stores: storesNext };
}

export function AdminDeliveryDistanceSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryDistanceSettingsPageInner />
    </Suspense>
  );
}

function AdminDeliveryDistanceSettingsPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [policySaved, setPolicySaved] = useState<DeliveryDistancePolicy>(DEFAULT_POLICY);
  /** LOC-011 — stored raw policy fields that differ from the applied (normalized) values. */
  const [policyRawDiff, setPolicyRawDiff] = useState<{ normalizedOnSave: string[]; ignored: string[] }>({
    normalizedOnSave: [],
    ignored: [],
  });
  /** admin_settings 행 버전 (`settings_updated_at`) — 전역 저장 PUT expected_updated_at (CAS). */
  const [settingsVersions, setSettingsVersions] = useState<Record<string, string | null> | null>(null);
  const [policyDraft, setPolicyDraft] = useState<DeliveryDistancePolicy>(DEFAULT_POLICY);
  const [overridesSaved, setOverridesSaved] = useState<DeliveryStoreDistanceOverrides>(DEFAULT_OVERRIDES);
  const [overridesDraft, setOverridesDraft] = useState<DeliveryStoreDistanceOverrides>(DEFAULT_OVERRIDES);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [radiusDrafts, setRadiusDrafts] = useState<Record<string, string>>({});
  const [radiusSavingId, setRadiusSavingId] = useState<string | null>(null);
  const lq = useAdminListQuery(STORE_LIST_CONFIG);
  const appliedQuery = lq.query.q;
  const page = lq.query.page;
  const pageSize = lq.query.size;
  const [totalStores, setTotalStores] = useState(0);
  /** 불러오기 실패 (설정·매장 목록) — 코드·HTTP 상태 → AdminErrorState. 저장 실패 문구는 `error`. */
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((text: string) => {
    if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    setMessage(text);
    msgTimerRef.current = setTimeout(() => {
      msgTimerRef.current = null;
      setMessage(null);
    }, 4000);
  }, []);

  /** 승인 매장 한 페이지 — 검색은 서버(DB)에서 적용한다. */
  const loadStores = useCallback(async (): Promise<boolean> => {
    setStoresLoading(true);
    setLoadErr(null);
    try {
      const qs = new URLSearchParams({ status: "approved", page: String(page), page_size: String(pageSize) });
      if (appliedQuery.trim()) qs.set("q", appliedQuery.trim());
      const storesRes = await fetch(`/api/admin/stores?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const storesJson = (await storesRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        stores?: unknown;
        total?: number;
      };
      if (!storesRes.ok || !storesJson.ok || !Array.isArray(storesJson.stores)) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadErr({ code: errCode(storesRes.status, storesJson, "load_failed"), status: storesRes.status });
        return false;
      }
      const nextStores = storesJson.stores as StoreRow[];
      setStores(nextStores);
      setTotalStores(typeof storesJson.total === "number" ? storesJson.total : nextStores.length);
      const drafts: Record<string, string> = {};
      for (const s of nextStores) {
        drafts[s.id] = formatStoreDeliveryRadiusKmForInput(s.delivery_radius_km);
      }
      setRadiusDrafts(drafts);
      return true;
    } catch {
      setLoadErr({ code: "network_error" });
      return false;
    } finally {
      setStoresLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [page, pageSize, appliedQuery, lq.refreshKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRes = await fetch("/api/admin/delivery/settings", { credentials: "include", cache: "no-store" });
      const settingsJson = (await settingsRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        distance_policy?: unknown;
        distance_policy_raw_diff?: { normalizedOnSave?: unknown; ignored?: unknown } | null;
        store_distance_overrides?: unknown;
        settings_updated_at?: Record<string, string | null> | null;
      };
      if (!settingsRes.ok || !settingsJson.ok) {
        setLoadErr({ code: errCode(settingsRes.status, settingsJson, "load_failed"), status: settingsRes.status });
        return;
      }
      const nextPolicy = normalizePolicy(settingsJson.distance_policy);
      const nextOverrides = normalizeOverrides(settingsJson.store_distance_overrides);
      setPolicySaved(nextPolicy);
      setPolicyDraft(nextPolicy);
      setOverridesSaved(nextOverrides);
      setOverridesDraft(nextOverrides);
      setSettingsVersions(settingsJson.settings_updated_at ?? null);
      const rawDiff = settingsJson.distance_policy_raw_diff;
      setPolicyRawDiff({
        normalizedOnSave: Array.isArray(rawDiff?.normalizedOnSave)
          ? rawDiff.normalizedOnSave.map(String)
          : [],
        ignored: Array.isArray(rawDiff?.ignored) ? rawDiff.ignored.map(String) : [],
      });
    } catch {
      setError(t("admin_delivery_distance_error_network"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 전역 설정은 최초·다시 불러오기에서만
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (msgTimerRef.current != null) clearTimeout(msgTimerRef.current);
    };
  }, [load]);

  /** 페이지·검색어가 바뀌면 매장 목록만 다시 불러온다 (전역 정책 초안은 유지). */
  useEffect(() => {
    void loadStores();
  }, [loadStores]);


  /** 검색은 서버에서 적용 — 현재 페이지 행 그대로. */
  const filteredStores = stores;

  /** 전역 저장 버튼은 전역 정책만 — 매장별 설정은 각 행의 「저장」 (DEF-51). */
  const dirty = useMemo(
    () => JSON.stringify(policyDraft) !== JSON.stringify(policySaved),
    [policyDraft, policySaved]
  );

  const updateStoreOverride = useCallback(
    (storeId: string, patch: Partial<{ mode: DeliveryStoreDistanceMode }>) => {
      setOverridesDraft((prev) => {
        const current = prev.stores[storeId] ?? { mode: "inherit" as const, maxKm: null };
        const next = { ...current, ...patch, maxKm: null };
        const storesNext = { ...prev.stores };
        if (next.mode === "inherit") {
          delete storesNext[storeId];
        } else {
          storesNext[storeId] = next;
        }
        return { stores: storesNext };
      });
    },
    []
  );

  /** 매장 한 줄 저장 — 반경과 거리 제한 모드를 버튼 하나로 저장한다 (DEF-51). */
  const saveStoreRow = useCallback(
    async (store: StoreRow) => {
      const storeId = store.id;
      const effectiveKm = resolveEffectiveStoreDeliveryRadiusKm(store.delivery_radius_km);
      const radiusDirty = (radiusDrafts[storeId] ?? String(effectiveKm)) !== String(effectiveKm);
      const nextMode = modeOf(overridesDraft, storeId);
      const modeDirty = nextMode !== modeOf(overridesSaved, storeId);
      if (!radiusDirty && !modeDirty) return;
      const parsed = radiusDirty ? parseStoreDeliveryRadiusKmForWrite(radiusDrafts[storeId]) : null;
      if (parsed && !parsed.ok) {
        setError(t("admin_biz_delivery_km_invalid"));
        return;
      }
      const name = store.store_name || store.slug || (ko ? "이 매장" : "this store");
      const changes: string[] = [];
      if (parsed && parsed.ok) changes.push(ko ? `배달 반경 ${parsed.value}km` : `Radius ${parsed.value} km`);
      if (modeDirty) changes.push(ko ? `거리 제한: ${distanceModeLabel(ko, nextMode)}` : `Distance limit: ${distanceModeLabel(ko, nextMode)}`);
      const c = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: ko ? `「${name}」 배달 설정을 저장할까요?` : `Save delivery settings for "${name}"?`,
        description: changes.join(" · "),
        confirmLabel: adminCta("save", ko),
      });
      if (!c.ok) return;

      setRadiusSavingId(storeId);
      setError(null);
      try {
        if (modeDirty) {
          /**
           * 모드 변경은 매장 단위 CAS 액션 하나로 저장한다 — 전역 overrides JSON 전체를 PUT 하면
           * 페이지를 연 뒤 다른 관리자가 바꾼 다른 매장 모드를 덮어쓴다. 반경도 같은 호출로 함께 반영.
           */
          const prevMode = modeOf(overridesSaved, storeId);
          const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_store_delivery_distance",
              distance_mode: nextMode,
              expected_distance_mode: prevMode,
              delivery_radius_km: parsed && parsed.ok ? parsed.value : store.delivery_radius_km ?? null,
            }),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !j.ok) {
            setError(adminOperatorErrorMessage(errCode(res.status, j, "update_failed"), ko));
            if (res.status === 409) void load();
            return;
          }
          setOverridesSaved((prev) => withStoreMode(prev, storeId, nextMode));
          setOverridesDraft((prev) => withStoreMode(prev, storeId, nextMode));
        } else if (parsed && parsed.ok) {
          const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_delivery_radius",
              delivery_radius_km: parsed.value,
            }),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !j.ok) {
            setError(adminOperatorErrorMessage(errCode(res.status, j, "update_failed"), ko));
            return;
          }
        }
        if (parsed && parsed.ok) {
          setStores((prev) =>
            prev.map((s) =>
              s.id === storeId
                ? {
                    ...s,
                    delivery_radius_km: parsed.value,
                    updated_at: new Date().toISOString(),
                  }
                : s
            )
          );
          setRadiusDrafts((prev) => ({ ...prev, [storeId]: String(parsed.value) }));
        }
        showMessage(ko ? `「${name}」 배달 설정을 저장했습니다.` : t("admin_delivery_distance_radius_saved"));
      } catch {
        setError(t("admin_delivery_distance_error_network"));
      } finally {
        setRadiusSavingId(null);
      }
    },
    [radiusDrafts, overridesDraft, overridesSaved, load, showMessage, t, ko]
  );

  const save = useCallback(async () => {
    const nextPolicy: DeliveryDistancePolicy = {
      ...policyDraft,
      /** Do not rewrite legacy defaultMaxKm from this UI — not store-radius authority. */
      defaultMaxKm: policySaved.defaultMaxKm,
      overDistanceBehavior: "exclude",
    };
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delivery/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_policy: nextPolicy,
          // 매장별 모드는 각 행 「저장」(CAS)으로만 반영 — 여기서 overrides 를 보내면 다른 관리자 변경을 덮어쓴다.
          expected_updated_at: settingsVersions ?? {},
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        distance_policy?: unknown;
        store_distance_overrides?: unknown;
        settings_updated_at?: Record<string, string | null> | null;
      };
      if (!res.ok || !j.ok) {
        const code = errCode(res.status, j, "update_failed");
        if (isAdminConflictErrorCode(code) || code === "expected_updated_at_required") {
          // 다른 관리자가 먼저 전역 정책을 저장 — 최신 값을 다시 불러온 뒤 안내 (초안은 최신 값으로 교체).
          await load();
          setError(adminConflictReloadedMessage(code, ko));
          return;
        }
        setError(adminOperatorErrorMessage(code, ko));
        return;
      }
      const savedPolicy = normalizePolicy(j.distance_policy);
      const savedOverrides = normalizeOverrides(j.store_distance_overrides);
      setPolicySaved(savedPolicy);
      setPolicyDraft(savedPolicy);
      setOverridesSaved(savedOverrides);
      setSettingsVersions(j.settings_updated_at ?? null);
      showMessage(t("admin_delivery_distance_saved"));
    } catch {
      setError(t("admin_delivery_distance_error_network"));
    } finally {
      setSaving(false);
    }
  }, [policyDraft, policySaved.defaultMaxKm, settingsVersions, load, showMessage, t, ko]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AdminPageHeader
        titleKey="admin_delivery_distance_title"
        descriptionKey="admin_delivery_distance_desc"
      />

      {message ? (
        <p className="mb-4 rounded-ui-rect border border-sam-success bg-sam-success-soft px-3 py-2 sam-text-body-secondary text-sam-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body-secondary text-sam-danger">
          {error}
        </p>
      ) : null}
      {loadErr ? (
        <div className="mb-4">
          <AdminErrorState
            ko={ko}
            code={loadErr.code}
            httpStatus={loadErr.status}
            onRetry={() => {
              void load();
              lq.refresh();
            }}
          />
        </div>
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_delivery_distance_global_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_delivery_distance_global_desc")}</p>
          </div>
          {/* 화면 primary 는 매장 목록 필터 바 [조회] 1개 — 전역 저장은 secondary (처리 중·미변경 시 비활성) */}
          <AdminActionButton variant="secondary" disabled={loading || saving || !dirty} onClick={() => void save()}>
            {t("admin_delivery_distance_save")}
          </AdminActionButton>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <span className="block sam-text-helper font-semibold text-sam-muted">
              {t("admin_delivery_distance_enabled")}
            </span>
            <select
              value={policyDraft.enabled ? "1" : "0"}
              onChange={(e) => setPolicyDraft((p) => ({ ...p, enabled: e.target.value === "1" }))}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            >
              <option value="0">{t("admin_delivery_distance_disabled")}</option>
              <option value="1">{t("admin_delivery_distance_enabled_on")}</option>
            </select>
          </label>

          <label className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <span className="block sam-text-helper font-semibold text-sam-muted">
              {t("admin_delivery_distance_source")}
            </span>
            <select
              value={policyDraft.source}
              onChange={(e) =>
                setPolicyDraft((p) => ({ ...p, source: e.target.value as DeliveryDistanceSource }))
              }
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary text-sam-fg"
            >
              <option value="straight">{t("admin_delivery_distance_source_straight")}</option>
              <option value="google">{t("admin_delivery_distance_source_google")}</option>
            </select>
          </label>
        </div>

        <p className="mt-3 sam-text-helper text-sam-muted">
          {t("admin_delivery_distance_over_policy")}
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {t("admin_delivery_distance_legacy_radius_note")}
        </p>
        {policyRawDiff.normalizedOnSave.length > 0 ? (
          <p className="mt-1 sam-text-helper text-sam-warning" data-testid="delivery-distance-raw-normalized">
            {t("admin_delivery_distance_raw_normalized_note", {
              fields: policyRawDiff.normalizedOnSave.join(", "),
            })}
          </p>
        ) : null}
        {policyRawDiff.ignored.length > 0 ? (
          <p className="mt-1 sam-text-helper text-sam-muted">
            {t("admin_delivery_distance_raw_ignored_note", { fields: policyRawDiff.ignored.join(", ") })}
          </p>
        ) : null}
      </section>

      <section className="mt-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_delivery_distance_store_title")}</h2>
            <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_delivery_distance_store_desc")}</p>
          </div>
        </div>
        <AdminFilterBar
          className="mt-3"
          ko={ko}
          draft={lq.draft}
          onDraftChange={lq.setDraft}
          onSubmit={lq.submit}
          onReset={lq.reset}
          pending={storesLoading}
          showPeriod={false}
          searchPlaceholder={t("admin_delivery_distance_store_search")}
        />

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left text-sam-muted">
                <th className="px-2 py-2">{t("admin_delivery_distance_th_store")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_address")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_radius")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_updated")}</th>
                <th className="px-2 py-2">{t("admin_delivery_distance_th_mode")}</th>
                <th className="px-2 py-2">{t("common_save")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((store) => {
                  const override = overridesDraft.stores[store.id] ?? {
                    mode: "inherit" as const,
                    maxKm: null,
                  };
                  const address =
                    [
                      store.formatted_address,
                      store.address_line1,
                      store.address_line2,
                      [store.region, store.city, store.district].filter(Boolean).join(" "),
                    ]
                      .map((x) => (typeof x === "string" ? x.trim() : ""))
                      .find((x) => x.length > 0) || t("admin_delivery_distance_unknown");
                  const effectiveKm = resolveEffectiveStoreDeliveryRadiusKm(store.delivery_radius_km);
                  const draft = radiusDrafts[store.id] ?? String(effectiveKm);
                  const radiusDirty = draft !== String(effectiveKm);
                  const modeDirty = override.mode !== modeOf(overridesSaved, store.id);
                  const rowDirty = radiusDirty || modeDirty;
                  return (
                    <tr key={store.id} className="border-b border-sam-border-soft align-top">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-sam-fg">
                          {store.store_name || store.slug || store.id}
                        </div>
                        <div className="sam-text-helper text-sam-muted">{store.slug}</div>
                      </td>
                      <td className="px-2 py-2 text-sam-muted">{address}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={draft}
                            onChange={(e) =>
                              setRadiusDrafts((prev) => ({
                                ...prev,
                                [store.id]: e.target.value,
                              }))
                            }
                            className="w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                          />
                          <span className="sam-text-helper text-sam-muted">km</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 sam-text-helper text-sam-muted">
                        {store.updated_at
                          ? formatAdminManilaDateTime(store.updated_at)
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={override.mode}
                          onChange={(e) =>
                            updateStoreOverride(store.id, {
                              mode: e.target.value as DeliveryStoreDistanceMode,
                            })
                          }
                          className="min-w-32 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                          aria-label={distanceModeLabel(ko, override.mode)}
                        >
                          <option value="inherit">{distanceModeLabel(ko, "inherit")}</option>
                          <option value="enabled">{distanceModeLabel(ko, "enabled")}</option>
                          <option value="disabled">{distanceModeLabel(ko, "disabled")}</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={radiusSavingId !== null || !rowDirty}
                          onClick={() => void saveStoreRow(store)}
                        >
                          {adminCta("save", ko)}
                        </AdminActionButton>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {(loading || storesLoading) && filteredStores.length === 0 ? (
          <AdminLoadingState ko={ko} />
        ) : filteredStores.length === 0 && !loadErr ? (
          <AdminEmptyState
            ko={ko}
            message={lq.isFiltered ? undefined : t("admin_delivery_distance_store_empty")}
            onReset={lq.isFiltered ? lq.reset : undefined}
          />
        ) : null}
        {filteredStores.length > 0 ? (
          <AdminPagination
            ko={ko}
            page={page}
            size={pageSize}
            total={totalStores}
            onPageChange={lq.setPage}
            onSizeChange={lq.setSize}
            disabled={storesLoading}
          />
        ) : null}
      </section>
    </div>
  );
}
