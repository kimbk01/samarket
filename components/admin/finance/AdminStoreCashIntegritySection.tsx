"use client";

/**
 * P0-6 실연결 (실기 FAIL 2026-11-03 — 무결성 패널이 화면에 없던 결함 정정):
 * 관리자 매장 재무 화면에서 Cash 원장 연쇄·잔액 대조 결과를 보여 준다. 불일치는 FAIL 그대로.
 */
import { useEffect, useState } from "react";
import {
  AdminCashLedgerIntegrityPanel,
  type AdminCashIntegrityPayload,
} from "@/components/admin/finance/AdminCashLedgerIntegrityPanel";

export function AdminStoreCashIntegritySection({ storeId, ko }: { storeId: string; ko: boolean }) {
  const [report, setReport] = useState<AdminCashIntegrityPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setReport(null);
    setFailed(false);
    fetch(`/api/admin/store-finance?storeId=${encodeURIComponent(storeId)}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok || !j?.ok || !j.cashIntegrity) setFailed(true);
        else setReport(j.cashIntegrity as AdminCashIntegrityPayload);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [storeId]);
  if (failed) return <AdminCashLedgerIntegrityPanel report={{ status: "UNAVAILABLE", error: "load_failed" }} ko={ko} />;
  return <AdminCashLedgerIntegrityPanel report={report} ko={ko} />;
}
