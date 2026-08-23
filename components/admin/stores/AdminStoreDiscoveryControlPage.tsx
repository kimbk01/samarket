"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStoreDiscoverySnapshotPanel } from "@/components/admin/stores/AdminStoreDiscoverySnapshotPanel";
import {
  AdminStoreDiscoveryCampaignWriterPanel,
  type AdminDiscoveryCampaignRow,
} from "@/components/admin/stores/AdminStoreDiscoveryCampaignWriterPanel";
import { Sam } from "@/lib/ui/sam-component-classes";

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
  const { t } = useI18n();
  const readOnly = t("admin_store_discovery_read_only_badge");

  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyErr, setPolicyErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);

  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsErr, setCampaignsErr] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

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
      const res = await fetch("/api/admin/store-discovery/campaigns", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: CampaignRow[];
      };
      if (!res.ok || !json.ok) {
        setCampaignsErr(json.error ?? "campaigns_load_error");
        setCampaigns([]);
        return;
      }
      setCampaigns(json.campaigns ?? []);
    } catch {
      setCampaignsErr("campaigns_load_error");
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

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
    void loadCampaigns();
    void loadDiagnostics();
  }, [loadPolicy, loadCampaigns, loadDiagnostics]);

  const stateLabel = (state: CampaignRow["computed_state"]) => {
    if (state === "active") return t("admin_store_discovery_state_active");
    if (state === "upcoming") return t("admin_store_discovery_state_upcoming");
    if (state === "expired") return t("admin_store_discovery_state_expired");
    return t("admin_store_discovery_state_inactive");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <AdminPageHeader
        titleKey="admin_store_discovery_title"
        descriptionKey="admin_store_discovery_desc"
        backHref="/admin/stores"
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={Sam.btn.secondary} onClick={refreshAll}>
          {t("admin_store_discovery_refresh")}
        </button>
        <span className="inline-flex items-center rounded-ui-rect border border-sam-border px-2 text-[12px] text-sam-muted">
          {readOnly}
        </span>
      </div>

      <AdminCard titleKey="admin_store_discovery_policy_title">
        <p className="mb-2 text-[11px] text-sam-muted">{readOnly}</p>
        {policyErr ? (
          <p className="mb-2 text-[13px] text-red-700">{t("admin_store_discovery_policy_fail")}</p>
        ) : null}
        {policyLoading ? (
          <p className="text-[13px] text-sam-muted">{t("admin_store_discovery_policy_loading")}</p>
        ) : policy ? (
          <div>
            <Field
              label={t("admin_store_discovery_field_global_mean")}
              value={fmt(policy.global_mean_rating)}
            />
            <Field
              label={t("admin_store_discovery_field_prior_weight")}
              value={fmt(policy.prior_weight)}
            />
            <Field
              label={t("admin_store_discovery_field_rating_count")}
              value={fmt(policy.rating_count)}
            />
            <Field
              label={t("admin_store_discovery_field_updated_at")}
              value={fmt(policy.updated_at)}
            />
            <Field label={t("admin_store_discovery_field_status")} value={fmt(policy.status)} />
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
      </AdminCard>

      <AdminCard titleKey="admin_store_discovery_snapshot_title">
        <p className="mb-2 text-[11px] text-sam-muted">{readOnly}</p>
        <p className="mb-3 text-[13px] text-sam-muted">{t("admin_store_discovery_snapshot_hint")}</p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="block text-[12px] text-sam-muted">
            {t("admin_store_discovery_snapshot_store_id")}
            <input
              className="mt-1 block w-[280px] max-w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px] text-sam-fg"
              value={snapshotStoreId}
              onChange={(e) => setSnapshotStoreId(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <button
            type="button"
            className={Sam.btn.primary}
            onClick={() => {
              const id = snapshotStoreId.trim();
              if (!id) return;
              setSnapshotQueryId(id);
            }}
          >
            {t("admin_store_discovery_snapshot_load")}
          </button>
        </div>
        {snapshotQueryId ? (
          <AdminStoreDiscoverySnapshotPanel storeId={snapshotQueryId} compact />
        ) : (
          <p className="text-[13px] text-sam-muted">{t("admin_store_discovery_snapshot_missing_id")}</p>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_store_discovery_diagnostics_title">
        <p className="mb-2 text-[11px] text-sam-muted">{readOnly}</p>
        <p className="mb-3 text-[13px] text-sam-muted">{t("admin_store_discovery_diagnostics_note")}</p>
        {diagErr ? (
          <p className="mb-2 text-[13px] text-red-700">{t("admin_store_discovery_diagnostics_fail")}</p>
        ) : null}
        {diagLoading ? (
          <p className="text-[13px] text-sam-muted">…</p>
        ) : diagnostics ? (
          <div>
            <Field label="ranking_authority" value={fmt(diagnostics.ranking_authority)} />
            <Field
              label="browse meta keys"
              value={diagnostics.public_api_meta_keys.browse.join(", ")}
            />
            <Field
              label="home-feed meta keys"
              value={diagnostics.public_api_meta_keys.home_feed.join(", ")}
            />
            <Field label="note" value={diagnostics.note} />
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
