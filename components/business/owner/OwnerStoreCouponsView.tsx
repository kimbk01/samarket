"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
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
import {
  newOwnerCouponClientRequestId,
  ownerCouponDoneMessageKey,
  ownerCouponErrorMessage,
} from "@/lib/stores/owner-coupon-feedback";

type CampaignRow = {
  id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  lifecycle_state: string;
  is_active?: boolean | null;
  paused_by?: string | null;
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
  const { t, language } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() ?? "";
  const createMode = sp.get("create") === "1";
  const campaignId = sp.get("campaign")?.trim() ?? "";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeId);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [tab, setTab] = useState<OwnerCouponListTab>("active");
  const [loaded, setLoaded] = useState(false);
  /** IA-06 — 목록 로드 실패는 빈 목록이 아니라 오류 띠 + 새로고침 */
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** IA-05 — 처리 중에는 확인창 버튼 비활성 · 재클릭 무시 */
  const [actBusy, setActBusy] = useState(false);
  const busyRef = useRef(false);
  const [pendingAct, setPendingAct] = useState<{
    id: string;
    action: OwnerCouponDetailAction;
    /** 재발행 확인창 1회분 고정 키 */
    clientRequestId: string | null;
  } | null>(null);
  const [opsDetail, setOpsDetail] = useState<CouponCampaignOpsView | null>(null);

  useEffect(() => {
    if (storeId) {
      setResolvedStoreId(storeId);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id =
        j?.ok && Array.isArray(j.stores)
          ? resolveOwnerActiveStoreIdFromOwnedList(j.stores, null) ?? ""
          : "";
      setResolvedStoreId(id);
    })();
  }, [storeId]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    try {
      const res = await fetch(`/api/me/store-coupons/campaigns?storeId=${encodeURIComponent(sid)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; campaigns?: CampaignRow[] } | null;
      if (res.ok && json?.ok) {
        setRows(json.campaigns ?? []);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
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

  const requestAct = (id: string, action: OwnerCouponDetailAction) => {
    if (busyRef.current) return;
    setActionError(null);
    setNotice(null);
    setPendingAct({ id, action, clientRequestId: action === "reissue" ? newOwnerCouponClientRequestId() : null });
  };

  /** true = 성공 (확인창 닫음). 실패면 확인창을 닫고 오류 띠를 띄운다 — 재발행 재시도는 새 확인창(새 키). */
  const act = async (pending: { id: string; action: OwnerCouponDetailAction; clientRequestId: string | null }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/me/store-coupons/campaigns", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pending.id,
          action: pending.action,
          ...(pending.clientRequestId ? { clientRequestId: pending.clientRequestId } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; campaign?: { id?: string } }
        | null;
      if (!res.ok || !json?.ok) {
        setActionError(ownerCouponErrorMessage(json?.error ?? null, t));
        await load();
        return;
      }
      setNotice(t(ownerCouponDoneMessageKey(pending.action)));
      await load();
      if (pending.action === "reissue" && json.campaign?.id) {
        router.push(OwnerRoutes.couponsDetail(String(json.campaign.id), resolvedStoreId));
      }
    } catch {
      setActionError(t("common_network_error"));
    } finally {
      busyRef.current = false;
      setActBusy(false);
      setPendingAct(null);
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

  const feedback = (
    <>
      {actionError ? (
        <div
          className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 text-sm leading-snug text-sam-danger"
          role="alert"
          data-owner-coupon-feedback="error"
        >
          {actionError}
        </div>
      ) : null}
      {notice ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm leading-snug text-sam-fg"
          role="status"
          data-owner-coupon-feedback="success"
        >
          {notice}
        </div>
      ) : null}
    </>
  );

  const pending = pendingAct;
  const copy = pending ? confirmCopy(pending.action) : confirmCopy("end");
  const confirmModal = (
    <OwnerStoreAdminConfirmModal
      open={Boolean(pending)}
      titleId="owner-coupon-act"
      title={copy.title}
      description={copy.description}
      confirmTone={pending?.action === "end" ? "danger" : "primary"}
      confirmLabel={copy.title}
      busy={actBusy}
      onCancel={() => {
        if (!busyRef.current) setPendingAct(null);
      }}
      onConfirm={async () => {
        if (!pending) return;
        await act(pending);
      }}
    />
  );

  if (campaignId) {
    const row = rows.find((r) => r.id === campaignId) ?? null;
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        {feedback}
        <OwnerStoreCouponDetailPanel
          row={row}
          ops={opsDetail}
          loading={!loaded && !opsDetail}
          onBack={goList}
          onAct={(action) => requestAct(campaignId, action)}
        />
        {confirmModal}
      </div>
    );
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS} data-owner-coupons-hub="1">
      <p className="sam-text-body-secondary text-sam-muted" data-owner-promo-product="coupon">
        {ownerUiCopy(language, "매장 쿠폰 — 고객에게 주는 무료 프로모션입니다. 유료 상품권과 다릅니다.", "Store coupons — free promotions for customers. Not paid gift certificates.")}
      </p>
      {loadError ? (
        <div
          className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 text-sm leading-snug text-sam-danger"
          role="alert"
          data-owner-coupon-feedback="load-error"
        >
          <span className="min-w-0">{t("store_coupon_owner_err_load")}</span>
          <button
            type="button"
            className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
            data-owner-coupon-reload="1"
            onClick={() => void load()}
          >
            {t("store_coupon_owner_reload")}
          </button>
        </div>
      ) : null}
      {feedback}
      <OwnerStoreCouponListDashboard
        rows={rows}
        tab={tab}
        onTab={setTab}
        canCreate={Boolean(resolvedStoreId)}
        onCreate={goCreate}
        openId={null}
        onToggleOpen={goDetail}
        onPause={(id) => requestAct(id, "pause")}
        onResume={(id) => requestAct(id, "resume")}
        onEnd={(id) => requestAct(id, "end")}
        onReissue={(id) => requestAct(id, "reissue")}
      />
      {confirmModal}
    </div>
  );
}
