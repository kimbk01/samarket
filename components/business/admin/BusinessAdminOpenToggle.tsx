"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { invalidateStorePublicCachesForSlug } from "@/lib/stores/store-public-cache-invalidate";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreCommerceStateLabel } from "@/components/business/owner/OwnerStoreCommerceStateLabel";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";
import { ownerFetchJson } from "@/lib/business/owner-fetch-json";
import { formatOwnerStoreToggleFailure } from "@/lib/business/owner-store-patch-error-i18n";

/** `stores.is_open` — null/미설정은 영업 중(기존 `!== false` 와 동일). 문자열 "false" 등은 parse 로 처리 */
function isStoreOpen(row: StoreRow): boolean {
  return parsePostgresBool(row.is_open, true);
}

export function BusinessAdminOpenToggle({
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
  /** IA-17 · D-14 — 영업 OFF 는 확인창 후 반영 */
  const [confirmOffOpen, setConfirmOffOpen] = useState(false);
  const isOpen = isStoreOpen(row);
  const disabled = busy || String(row.approval_status) !== "approved";

  const shownOpen = pendingUi !== null ? pendingUi : isOpen;

  useEffect(() => {
    if (pendingUi === null) return;
    if (isOpen === pendingUi) setPendingUi(null);
  }, [isOpen, pendingUi]);

  const commitOpen = useCallback(
    async (next: boolean): Promise<boolean> => {
      setBusy(true);
      setPendingUi(next);
      try {
        const res = await ownerFetchJson(`/api/me/stores/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_open: next }),
        });
        if (!res.ok) {
          setPendingUi(null);
          toast.error(formatOwnerStoreToggleFailure(res.code, language));
          return false;
        }
        invalidateMeStoresListDedupedCache();
        const slug = String(row.slug ?? "").trim();
        if (slug) invalidateStorePublicCachesForSlug(slug);
        await Promise.resolve(onUpdated());
        return true;
      } finally {
        setBusy(false);
      }
    },
    [language, onUpdated, row.id, row.slug, toast]
  );

  const applyOpen = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next === isOpen && pendingUi === null) return true;
      if (!next) {
        setConfirmOffOpen(true);
        return false;
      }
      return commitOpen(next);
    },
    [commitOpen, isOpen, pendingUi]
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* OPS-04 — 실효 상태(스케줄·휴게·휴무 반영) + 토글은 수동 플래그임을 라벨로 명시 */}
      <OwnerStoreCommerceStateLabel row={row} />
      <span className="sam-text-helper font-semibold text-sam-fg">{t("business_ops3b_open_toggle_manual")}</span>
      <StoreOpsOnOffSwitch
        checked={shownOpen}
        disabled={disabled}
        onCheckedChange={applyOpen}
        ariaLabel={shownOpen ? t("business_phase7_583") : t("business_phase7_584")}
      />
      <OwnerStoreAdminConfirmModal
        open={confirmOffOpen}
        titleId={`owner-store-open-off-${row.id}`}
        title={t("owner_s4_open_off_title")}
        description={t("owner_s4_open_off_desc")}
        confirmLabel={t("owner_s4_turn_off")}
        busy={busy}
        confirmTone="danger"
        onCancel={() => setConfirmOffOpen(false)}
        onConfirm={async () => {
          await commitOpen(false);
          setConfirmOffOpen(false);
        }}
      />
    </div>
  );
}
