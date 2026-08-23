"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ReviewBlock, ReviewRow } from "@/components/admin/stores/admin-store-review-ui";

type Snapshot = {
  store_id: string;
  store_name: string | null;
  first_listed_at: string | null;
  new_store_qualifying_now: boolean;
  new_store_window_days: number;
  delivery_fee_mode: string | null;
  delivery_fee_strike_reference_php: number | null;
  active_discovery_campaign: {
    id: string;
    campaign_type: string;
    title: string;
    start_at: string;
    end_at: string;
  } | null;
};

function dash(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

export function AdminStoreDiscoverySnapshotPanel({
  storeId,
  compact = false,
}: {
  storeId: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    const id = storeId.trim();
    if (!id) {
      setErr("missing_store_id");
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/store-discovery/stores/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        snapshot?: Snapshot | null;
      };
      if (!res.ok || !json.ok || !json.snapshot) {
        setErr(json.error ?? "snapshot_load_error");
        setSnapshot(null);
        return;
      }
      setSnapshot(json.snapshot);
    } catch {
      setErr("snapshot_load_error");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const campaign = snapshot?.active_discovery_campaign;

  return (
    <ReviewBlock title={t("admin_store_discovery_panel_review_title")}>
      {loading ? (
        <p className="px-4 py-2 text-[13px] text-[#6B6B6B]">{t("admin_store_discovery_snapshot_loading")}</p>
      ) : err ? (
        <p className="px-4 py-2 text-[13px] text-[#B71C1C]">{t("admin_store_discovery_snapshot_fail")}</p>
      ) : snapshot ? (
        <>
          <ReviewRow label={t("admin_store_discovery_field_store_name")} value={dash(snapshot.store_name)} />
          <ReviewRow
            label={t("admin_store_discovery_field_first_listed_at")}
            value={dash(snapshot.first_listed_at)}
          />
          <ReviewRow
            label={t("admin_store_discovery_field_new_store")}
            value={
              snapshot.new_store_qualifying_now
                ? `${t("admin_store_discovery_yes")} (${snapshot.new_store_window_days}d)`
                : t("admin_store_discovery_no")
            }
          />
          <ReviewRow
            label={t("admin_store_discovery_field_delivery_fee_mode")}
            value={dash(snapshot.delivery_fee_mode)}
          />
          <ReviewRow
            label={t("admin_store_discovery_field_strike_ref")}
            value={
              snapshot.delivery_fee_strike_reference_php == null
                ? t("admin_store_discovery_none")
                : `₱${snapshot.delivery_fee_strike_reference_php}`
            }
          />
          <ReviewRow
            label={t("admin_store_discovery_field_active_campaign")}
            value={
              campaign
                ? `${campaign.campaign_type} · ${campaign.title}`
                : t("admin_store_discovery_none")
            }
          />
        </>
      ) : null}
      {!compact ? (
        <div className="px-4 py-2">
          <Link href="/admin/store-discovery" className="text-[13px] text-signature underline">
            {t("admin_store_discovery_panel_review_link")}
          </Link>
        </div>
      ) : null}
    </ReviewBlock>
  );
}
