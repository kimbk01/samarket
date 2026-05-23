"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { invalidateStorePublicCachesForSlug } from "@/lib/stores/store-public-cache-invalidate";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [pendingUi, setPendingUi] = useState<boolean | null>(null);
  const isOpen = isStoreOpen(row);
  const disabled = busy || String(row.approval_status) !== "approved";

  const shownOpen = pendingUi !== null ? pendingUi : isOpen;

  useEffect(() => {
    if (pendingUi === null) return;
    if (isOpen === pendingUi) setPendingUi(null);
  }, [isOpen, pendingUi]);

  const applyOpen = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next === isOpen && pendingUi === null) return true;
      setBusy(true);
      setPendingUi(next);
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_open: next }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!j?.ok) {
          setPendingUi(null);
          return false;
        }
        invalidateMeStoresListDedupedCache();
        const slug = String(row.slug ?? "").trim();
        if (slug) invalidateStorePublicCachesForSlug(slug);
        await Promise.resolve(onUpdated());
        return true;
      } catch {
        setPendingUi(null);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [isOpen, onUpdated, row.id, row.slug]
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="sam-text-helper font-semibold text-sam-fg">{t("business_phase7_198")}</span>
      <StoreOpsOnOffSwitch
        checked={shownOpen}
        disabled={disabled}
        onCheckedChange={applyOpen}
        ariaLabel={shownOpen ? "영업 끄기: 주문 접수 중지" : "영업 켜기: 주문 접수 시작"}
      />
    </div>
  );
}
