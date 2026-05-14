"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";

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
  const [busy, setBusy] = useState(false);
  const [pendingUi, setPendingUi] = useState<boolean | null>(null);
  const isVisible = parsePostgresBool(row.is_visible, false);
  const disabled = busy || String(row.approval_status) !== "approved";

  const shownVisible = pendingUi !== null ? pendingUi : isVisible;

  useEffect(() => {
    if (pendingUi === null) return;
    if (isVisible === pendingUi) setPendingUi(null);
  }, [isVisible, pendingUi]);

  const applyVisible = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next === isVisible && pendingUi === null) return true;
      setBusy(true);
      setPendingUi(next);
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_visible: next }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!j?.ok) {
          setPendingUi(null);
          return false;
        }
        invalidateMeStoresListDedupedCache();
        await Promise.resolve(onUpdated());
        return true;
      } catch {
        setPendingUi(null);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [isVisible, onUpdated, row.id]
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="sam-text-helper font-semibold text-sam-fg">노출</span>
      <StoreOpsOnOffSwitch
        checked={shownVisible}
        disabled={disabled}
        onCheckedChange={applyVisible}
        ariaLabel={shownVisible ? "노출 끄기: 매장 목록·탭에서 숨김" : "노출 켜기: 매장 목록·탭에 표시"}
      />
    </div>
  );
}
