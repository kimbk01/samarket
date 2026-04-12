"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isAdminUser } from "@/lib/auth/get-current-user";

export function OpsTradePolicyPanel() {
  const [autoDays, setAutoDays] = useState(7);
  const [reviewDays, setReviewDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const me = getCurrentUser();
    const u = me?.id?.trim();
    if (!u || !isAdminUser(me)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ops-trade-policy");
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.buyerAutoConfirmDays === "number") {
        setAutoDays(data.buyerAutoConfirmDays);
        setReviewDays(data.buyerReviewDeadlineDays ?? 14);
      }
    } catch {
      setMsg("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const u = getCurrentUser()?.id?.trim();
    if (!u) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ops-trade-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAutoConfirmDays: autoDays,
          buyerReviewDeadlineDays: reviewDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg((data as { error?: string }).error ?? "저장 실패");
        return;
      }
      setMsg("저장했습니다.");
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-sam-muted">거래 정책 불러오는 중…</p>;
  }

  return (
    <div className="mt-8 border-t border-sam-border pt-6">
      <h3 className="text-[15px] font-semibold text-sam-fg">구매자 거래·평가 (DB 연동)</h3>
      <p className="mt-1 text-[12px] text-sam-muted">
        판매자 거래완료 후 구매자가 확인하지 않을 때 자동으로 거래완료 확인 처리되는 일수, 그리고 확인 후 평가·후기 제한
        모드 전까지의 일수입니다. Supabase에 <code className="text-[11px]">ops_trade_policy</code> 테이블이 있어야
        저장됩니다.
      </p>
      <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[13px] font-medium text-sam-fg">구매자 미반영 자동 처리 (일)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={autoDays}
            onChange={(e) => setAutoDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-sam-fg">평가·후기 기한 (일)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={reviewDays}
            onChange={(e) => setReviewDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : "거래 정책 저장"}
        </button>
        {msg ? <span className="text-[13px] text-sam-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
