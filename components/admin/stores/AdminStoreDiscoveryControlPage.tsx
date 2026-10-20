"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStoreDiscoverySnapshotPanel } from "@/components/admin/stores/AdminStoreDiscoverySnapshotPanel";
import {
  AdminStoreDiscoveryCampaignWriterPanel,
  type AdminDiscoveryCampaignRow,
} from "@/components/admin/stores/AdminStoreDiscoveryCampaignWriterPanel";
import { AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminConfigAuditHistoryPanel } from "@/components/admin/delivery/AdminConfigAuditHistoryPanel";

type Policy = {
  global_mean_rating: number | null;
  prior_weight: number | null;
  rating_count: number | null;
  updated_at: string | null;
  status: string;
};

type CampaignRow = AdminDiscoveryCampaignRow;

type Diagnostics = {
  ranking_authority: string;
  public_api_meta_keys: { browse: readonly string[]; home_feed: readonly string[] };
  note: string;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(140px,220px)_1fr] gap-2 border-b border-sam-border/60 py-2 text-[13px] last:border-b-0">
      <div className="text-sam-muted">{label}</div>
      <div className="break-all font-medium text-sam-fg">{value}</div>
    </div>
  );
}

function fmt(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

export function AdminStoreDiscoveryControlPage() {
  return (
    <Suspense fallback={null}>
      <AdminStoreDiscoveryControlPageInner />
    </Suspense>
  );
}

function AdminStoreDiscoveryControlPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const monitorReadOnly = t("admin_store_discovery_read_only_badge");

  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyErr, setPolicyErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);

  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsErr, setCampaignsErr] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  /** 캠페인 목록 = 서버 페이지 (주소 `page`·`size`) — 예전 200건 고정 상한 제거 (R7). */
  const lq = useAdminListQuery();
  const [campaignsTotal, setCampaignsTotal] = useState(0);
  const campaignsQs = lq.apiQueryString;

  const [diagLoading, setDiagLoading] = useState(true);
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const [snapshotStoreId, setSnapshotStoreId] = useState("");
  const [snapshotQueryId, setSnapshotQueryId] = useState("");

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyErr(null);
    try {
      const res = await fetch("/api/admin/store-discovery/rating-policy", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; policy?: Policy | null };
      if (!res.ok || !json.ok || !json.policy) {
        setPolicyErr(json.error ?? "policy_load_error");
        setPolicy(null);
        return;
      }
      setPolicy(json.policy);
    } catch {
      setPolicyErr("policy_load_error");
      setPolicy(null);
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    setCampaignsErr(null);
    try {
      const res = await fetch(`/api/admin/store-discovery/campaigns?${campaignsQs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        campaigns?: CampaignRow[];
        total?: number;
      };
      if (!res.ok || !json.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setCampaignsErr(res.status === 403 ? "forbidden" : json.error ?? "campaigns_load_error");
        return;
      }
      setCampaigns(json.campaigns ?? []);
      setCampaignsTotal(Number(json.total) || 0);
    } catch {
      setCampaignsErr("network_error");
    } finally {
      setCampaignsLoading(false);
    }
  }, [campaignsQs]);

  const loadDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagErr(null);
    try {
      const res = await fetch("/api/admin/store-discovery/diagnostics", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        diagnostics?: Diagnostics;
      };
      if (!res.ok || !json.ok || !json.diagnostics) {
        setDiagErr(json.error ?? "diagnostics_load_error");
        setDiagnostics(null);
        return;
      }
      setDiagnostics(json.diagnostics);
    } catch {
      setDiagErr("diagnostics_load_error");
      setDiagnostics(null);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadPolicy();
    void loadCampaigns();
    void loadDiagnostics();
  }, [loadPolicy, loadCampaigns, loadDiagnostics]);

  useEffect(() => {
    void loadPolicy();
    void loadDiagnostics();
  }, [loadPolicy, loadDiagnostics]);

  useEffect(() => {
    void loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [lq.refreshKey]);

  const stateLabel = (state: CampaignRow["computed_state"]) => {
    if (state === "active") return t("admin_store_discovery_state_active");
    if (state === "upcoming") return t("admin_store_discovery_state_upcoming");
    if (state === "expired") return t("admin_store_discovery_state_expired");
    return t("admin_store_discovery_state_inactive");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <AdminPageHeader
        titleKey="admin_menu_store_promo_control"
        descriptionKey="admin_r4c_discovery_desc"
        backHref="/admin/delivery"
      />

      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" onClick={refreshAll}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>

      <AdminCard titleKey="admin_store_discovery_policy_title">
        <p className="mb-2 text-[12px] text-sam-muted">{monitorReadOnly}</p>
        {policyErr ? (
          <AdminErrorState ko={ko} code={policyErr} onRetry={() => void loadPolicy()} />
        ) : null}
        {policyLoading ? (
          <AdminLoadingState ko={ko} label={t("admin_store_discovery_policy_loading")} />
        ) : policy ? (
          <div>
            <Field
              label={t("admin_r4c_discovery_field_global_mean")}
              value={fmt(policy.global_mean_rating)}
            />
            <Field
              label={t("admin_r4c_discovery_field_prior_weight")}
              value={fmt(policy.prior_weight)}
            />
            <Field
              label={t("admin_r4c_discovery_field_rating_count")}
              value={fmt(policy.rating_count)}
            />
            <Field
              label={t("admin_r4c_discovery_field_updated_at")}
              value={policy.updated_at ? formatAdminManilaDateTime(policy.updated_at) : "—"}
            />
            <Field
              label={t("admin_r4c_discovery_field_status")}
              value={policy.status === "active" ? t("admin_r4c_discovery_status_ok") : t("admin_r4c_discovery_status_other")}
            />
            <AdminTechDetails ko={ko}>
              global_mean_rating · prior_weight · rating_count · status={fmt(policy.status)}
            </AdminTechDetails>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard titleKey="admin_store_discovery_campaigns_title">
        <AdminStoreDiscoveryCampaignWriterPanel
          campaigns={campaigns}
          loading={campaignsLoading}
          error={campaignsErr}
          onRefresh={loadCampaigns}
          stateLabel={stateLabel}
        />
        {campaigns.length > 0 ? (
          <AdminPagination
            ko={ko}
            page={lq.query.page}
            size={lq.query.size}
            total={campaignsTotal}
            onPageChange={lq.setPage}
            onSizeChange={lq.setSize}
            disabled={campaignsLoading}
          />
        ) : null}
        {/* DEF-40: 기획 프로모션 생성·수정 감사 기록 */}
        <div className="mt-4 border-t border-sam-border-soft pt-3">
          <AdminConfigAuditHistoryPanel scope="discovery" limit={20} refreshToken={campaigns.length} />
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_store_discovery_snapshot_title">
        <p className="mb-2 text-[12px] text-sam-muted">{monitorReadOnly}</p>
        <p className="mb-3 text-[13px] text-sam-muted">{t("admin_store_discovery_snapshot_hint")}</p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="block text-[12px] text-sam-muted">
            {t("admin_store_discovery_snapshot_store_id")}
            <input
              className="mt-1 block w-[280px] max-w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
              value={snapshotStoreId}
              onChange={(e) => setSnapshotStoreId(e.target.value)}
              placeholder={t("admin_store_discovery_snapshot_store_id")}
            />
          </label>
          <AdminActionButton
            variant="secondary"
            onClick={() => {
              const id = snapshotStoreId.trim();
              if (!id) return;
              setSnapshotQueryId(id);
            }}
          >
            {t("admin_store_discovery_snapshot_load")}
          </AdminActionButton>
        </div>
        {snapshotQueryId ? (
          <AdminStoreDiscoverySnapshotPanel storeId={snapshotQueryId} compact />
        ) : (
          <p className="text-[13px] text-sam-muted">{t("admin_store_discovery_snapshot_missing_id")}</p>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_store_discovery_diagnostics_title">
        <p className="mb-2 text-[12px] text-sam-muted">{monitorReadOnly}</p>
        <p className="mb-3 text-[13px] text-sam-muted">{t("admin_store_discovery_diagnostics_note")}</p>
        {diagErr ? (
          <AdminErrorState ko={ko} code={diagErr} onRetry={() => void loadDiagnostics()} />
        ) : null}
        {diagLoading ? (
          <AdminLoadingState ko={ko} />
        ) : diagnostics ? (
          <div>
            <Field label={t("admin_r4c_discovery_note")} value={diagnostics.note} />
            <AdminTechDetails ko={ko}>
              <div>ranking_authority: {fmt(diagnostics.ranking_authority)}</div>
              <div>browse meta keys: {diagnostics.public_api_meta_keys.browse.join(", ")}</div>
              <div>home-feed meta keys: {diagnostics.public_api_meta_keys.home_feed.join(", ")}</div>
            </AdminTechDetails>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
