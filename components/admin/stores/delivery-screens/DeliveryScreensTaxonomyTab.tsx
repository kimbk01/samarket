"use client";

/**
 * 5-F 업종 분류 탭 — 1차·2차 업종 관리. `/admin/stores/application-settings?menu=stores` 와 같은 컴포넌트·저장 API.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminConfigAuditHistoryPanel } from "@/components/admin/delivery/AdminConfigAuditHistoryPanel";
import { AdminStoreTaxonomyManager } from "@/components/admin/stores/AdminStoreTaxonomyManager";

export function DeliveryScreensTaxonomyTab() {
  const [msg, setMsg] = useState<string | null>(null);
  const [auditTick, setAuditTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((text: string) => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setMsg(text);
    setAuditTick((n) => n + 1);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMsg(null);
    }, 4000);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className="space-y-4" data-delivery-screens-tab="taxonomy">
      {msg ? (
        <p className="rounded-ui-rect bg-sam-success-soft px-3 py-2 text-[13px] font-semibold text-sam-success">{msg}</p>
      ) : null}
      <AdminStoreTaxonomyManager onMessage={showMessage} />
      <section className="rounded-ui-rect border border-sam-border bg-white p-4">
        <AdminConfigAuditHistoryPanel scope="taxonomy" limit={20} refreshToken={auditTick} />
      </section>
    </div>
  );
}
