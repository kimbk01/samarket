"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreCouponCreatePanel } from "@/components/business/owner/OwnerStoreCouponCreatePanel";
import { OwnerStoreCouponDetailPanel } from "@/components/business/owner/OwnerStoreCouponDetailPanel";
import { OwnerStoreCouponListDashboard } from "@/components/business/owner/OwnerStoreCouponListDashboard";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OWNER_ADMIN_OUTLINE_BTN_CLASS } from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerCouponDetailAction, OwnerCouponListTab } from "@/lib/stores/owner-coupon-list-bucket";
import type { CouponCampaignOpsView } from "@/lib/stores/load-coupon-campaign-ops-bundle";

type CampaignRow = {
  id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  lifecycle_state: string;
  funding_mode: string;
  issued_count?: number;
  issue_limit?: number | null;
  spend_budget_php?: number | null;
  reserved_spend_php?: number | null;
  redeemed_count?: number;
  start_at?: string | null;
  end_at?: string | null;
  usage_end_at?: string | null;
  max_discount?: number | null;
  created_at?: string | null;
  active_held_count?: number;
  remaining_claim_slots?: number | null;
  order_sales_php?: number;
  realized_discount_php?: number;
  realized_store_php?: number;
  realized_platform_php?: number;
};

export function OwnerStoreCouponsView() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const createMode = sp.get("create") === "1";
  const campaignId = sp.get("campaign")?.trim() ?? "";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeId);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [tab, setTab] = useState<OwnerCouponListTab>("active");
  const [loaded, setLoaded] = useState(false);
  const [endId, setEndId] = useState<string | null>(null);
  const [pendingAct, setPendingAct] = useState<{ id: string; action: OwnerCouponDetailAction } | null>(null);
  const [opsDetail, setOpsDetail] = useState<CouponCampaignOpsView | null>(null);

  useEffect(() => {
    if (storeId) {
      setResolvedStoreId(storeId);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id = j?.ok && j.stores?.[0]?.id ? String(j.stores[0].id) : "";
      setResolvedStoreId(id);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    const res = await fetch(`/api/me/store-coupons/campaigns?storeId=${encodeURIComponent(sid)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; campaigns?: CampaignRow[] };
    setRows(json.ok ? json.campaigns ?? [] : []);
    setLoaded(true);
  }, [resolvedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const cid = campaignId.trim();
    if (!cid) {
      setOpsDetail(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/me/store-coupons/campaigns?ops=1&campaignId=${encodeURIComponent(cid)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; campaign?: CouponCampaignOpsView } | null) => {
        if (!cancelled) setOpsDetail(json?.ok ? json.campaign ?? null : null);
      })
      .catch(() => {
        if (!cancelled) setOpsDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const act = async (id: string, action: string) => {
    const res = await fetch("/api/me/store-coupons/campaigns", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; campaign?: { id?: string } } | null;
    await load();
    if (action === "reissue" && json?.ok && json.campaign?.id) {
      router.push(OwnerRoutes.couponsDetail(String(json.campaign.id), resolvedStoreId));
    }
  };

  const goList = () => router.push(OwnerRoutes.coupons(resolvedStoreId));
  const goCreate = () => router.push(OwnerRoutes.couponsCreate(resolvedStoreId));
  const goDetail = (id: string) => router.push(OwnerRoutes.couponsDetail(id, resolvedStoreId));

  const confirmCopy = (action: OwnerCouponDetailAction) => {
    if (action === "pause") {
      return { title: t("store_coupon_owner_pause"), description: t("store_coupon_owner_pause_confirm") };
    }
    if (action === "resume") {
      return { title: t("store_coupon_owner_resume"), description: t("store_coupon_owner_resume_confirm") };
    }
    if (action === "reissue") {
      return { title: t("store_coupon_owner_reissue"), description: t("store_coupon_owner_reissue_confirm") };
    }
    return { title: t("store_coupon_owner_end"), description: t("store_coupon_owner_end_confirm") };
  };

  if (createMode) {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <OwnerStoreAdminDashSection title={t("store_coupon_owner_create")}>
          <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mb-3`} onClick={goList}>
            {t("store_coupon_owner_back_list")}
          </button>
          <OwnerStoreCouponCreatePanel
            storeId={resolvedStoreId}
            onCreated={() => {
              void load();
              goList();
            }}
          />
        </OwnerStoreAdminDashSection>
      </div>
    );
  }

  if (campaignId) {
    const row = rows.find((r) => r.id === campaignId) ?? null;
    const pending = pendingAct;
    const copy = pending ? confirmCopy(pending.action) : confirmCopy("end");
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <OwnerStoreCouponDetailPanel
          row={row}
          ops={opsDetail}
          loading={!loaded && !opsDetail}
          onBack={goList}
          onAct={(action) => setPendingAct({ id: campaignId, action })}
        />
        <OwnerStoreAdminConfirmModal
          open={Boolean(pending)}
          titleId="owner-coupon-detail-act"
          title={copy.title}
          description={copy.description}
          confirmTone={pending?.action === "end" ? "danger" : "primary"}
          confirmLabel={copy.title}
          onCancel={() => setPendingAct(null)}
          onConfirm={async () => {
            if (!pending) return;
            await act(pending.id, pending.action);
            setPendingAct(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <OwnerStoreCouponListDashboard
        rows={rows}
        tab={tab}
        onTab={setTab}
        canCreate={Boolean(resolvedStoreId)}
        onCreate={goCreate}
        openId={null}
        onToggleOpen={goDetail}
        onPause={(id) => void act(id, "pause")}
        onResume={(id) => void act(id, "resume")}
        onEnd={(id) => setEndId(id)}
        onReissue={(id) => void act(id, "reissue")}
      />
      <OwnerStoreAdminConfirmModal
        open={Boolean(endId)}
        titleId="owner-coupon-end"
        title={t("store_coupon_owner_end")}
        description={t("store_coupon_owner_end_confirm")}
        confirmTone="danger"
        confirmLabel={t("store_coupon_owner_end")}
        onCancel={() => setEndId(null)}
        onConfirm={async () => {
          if (!endId) return;
          await act(endId, "end");
          setEndId(null);
        }}
      />
    </div>
  );
}
