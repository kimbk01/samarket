"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { ownerFetchJson } from "@/lib/business/owner-fetch-json";
import { formatOwnerStoreToggleFailure } from "@/lib/business/owner-store-patch-error-i18n";
import { STORE_ADMIN_VISIBILITY_LOCKED_ERROR } from "@/lib/stores/store-admin-visibility-lock";

/**
 * `stores.is_visible` — 동네 매장 목록·탭·공개 매장 URL 노출 여부.
 * 관리자 승인 시 기본 false (`approve_store`); 배달 운영 설정과 동일 PATCH.
 */
export function BusinessAdminVisibleToggle({
  row,
  onUpdated,
}: {
  row: StoreRow;
  onUpdated: () => void | Promise<void>;
}) {
  const { t, language } = useI18n();
  const toast = useOwnerToast();
  const [busy, setBusy] = useState(false);
  const [pendingUi, setPendingUi] = useState<boolean | null>(null);
  /** IA-17 · D-14 — 노출 OFF 는 확인창 후 반영 */
  const [confirmOffOpen, setConfirmOffOpen] = useState(false);
  const isVisible = parsePostgresBool(row.is_visible, false);
  /**
   * v4 UI-03 — O-04 관리자 숨김 잠금. 매장 행에 잠금 값이 실려 오면 그대로 쓰고,
   * 없으면 「켜기」 409 `admin_visibility_locked` 이후 이 화면에서 잠금으로 고정한다.
   */
  const [lockedBy409, setLockedBy409] = useState(false);
  const rowLocked = parsePostgresBool(
    (row as unknown as Record<string, unknown>).admin_visibility_locked,
    false
  );
  const adminLocked = !isVisible && (rowLocked || lockedBy409);
  const disabled = busy || String(row.approval_status) !== "approved" || adminLocked;

  const shownVisible = pendingUi !== null ? pendingUi : isVisible;

  useEffect(() => {
    if (pendingUi === null) return;
    if (isVisible === pendingUi) setPendingUi(null);
  }, [isVisible, pendingUi]);

  const commitVisible = useCallback(
    async (next: boolean): Promise<boolean> => {
      setBusy(true);
      setPendingUi(next);
      try {
        const res = await ownerFetchJson(`/api/me/stores/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_visible: next }),
        });
        if (!res.ok) {
          setPendingUi(null);
          if (res.code === STORE_ADMIN_VISIBILITY_LOCKED_ERROR) setLockedBy409(true);
          toast.error(formatOwnerStoreToggleFailure(res.code, language));
          return false;
        }
        invalidateMeStoresListDedupedCache();
        await Promise.resolve(onUpdated());
        return true;
      } finally {
        setBusy(false);
      }
    },
    [language, onUpdated, row.id, toast]
  );

  const applyVisible = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next === isVisible && pendingUi === null) return true;
      if (!next) {
        setConfirmOffOpen(true);
        return false;
      }
      return commitVisible(next);
    },
    [commitVisible, isVisible, pendingUi]
  );

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-2">
        <span className="sam-text-helper font-semibold text-sam-fg">{t("business_phase7_047")}</span>
        <StoreOpsOnOffSwitch
          checked={shownVisible}
          disabled={disabled}
          onCheckedChange={applyVisible}
          ariaLabel={shownVisible ? t("business_phase7_585") : t("business_phase7_586")}
        />
      </div>
      {adminLocked ? (
        <p
          className="sam-text-helper text-sam-warning"
          role="status"
          data-owner-store-visibility-admin-locked="1"
        >
          {t("business_ops4_err_admin_visibility_locked")}
        </p>
      ) : null}
      <OwnerStoreAdminConfirmModal
        open={confirmOffOpen}
        titleId={`owner-store-visible-off-${row.id}`}
        title={t("owner_s4_visible_off_title")}
        description={t("owner_s4_visible_off_desc")}
        confirmLabel={t("owner_s4_turn_off")}
        busy={busy}
        confirmTone="danger"
        onCancel={() => setConfirmOffOpen(false)}
        onConfirm={async () => {
          await commitVisible(false);
          setConfirmOffOpen(false);
        }}
      />
    </div>
  );
}
