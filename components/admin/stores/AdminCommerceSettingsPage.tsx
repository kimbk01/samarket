"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

type Overridden = {
  store_auto_complete_days: boolean;
  store_settlement_fee_bp: boolean;
  store_settlement_delay_days: boolean;
};

export function AdminCommerceSettingsPage() {
  const [autoDays, setAutoDays] = useState("");
  const [feeBp, setFeeBp] = useState("");
  const [delayDays, setDelayDays] = useState("");
  const [overridden, setOverridden] = useState<Overridden | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "admin_settings 테이블을 적용해 주세요." : json?.error);
        return;
      }
      const e = json.effective;
      setAutoDays(String(e.store_auto_complete_days ?? ""));
      setFeeBp(String(e.store_settlement_fee_bp ?? ""));
      setDelayDays(String(e.store_settlement_delay_days ?? ""));
      setOverridden(json.overridden_in_db as Overridden);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(partial: Record<string, number | null>) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/commerce-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "save_failed");
        return;
      }
      setMsg("저장했습니다.");
      const e = json.effective;
      setAutoDays(String(e.store_auto_complete_days ?? ""));
      setFeeBp(String(e.store_settlement_fee_bp ?? ""));
      setDelayDays(String(e.store_settlement_delay_days ?? ""));
      setOverridden(json.overridden_in_db as Overridden);
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <AdminPageHeader title="매장 커머스 수치" />
      <p className="text-[13px] text-gray-600">
        DB에 값이 있으면 <strong>.env보다 우선</strong>합니다. &quot;DB 제거&quot;는 해당 항목만 환경변수 기본으로
        돌립니다. 주문 채팅 일치 알림음은{" "}
        <Link href="/admin/stores/application-settings" className="text-signature underline">
          매장 설정 (매장 신청)
        </Link>
        에서 프리셋·업로드로 설정합니다.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-green-800">{msg}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : (
        <form
          className="space-y-5 rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              store_auto_complete_days: Math.round(Number(autoDays)),
              store_settlement_fee_bp: Math.round(Number(feeBp)),
              store_settlement_delay_days: Math.round(Number(delayDays)),
            });
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              자동 구매확정(일) — 픽업 가능·배송중 후{" "}
              {overridden?.store_auto_complete_days ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-gray-400">env</span>
              )}
            </span>
            <input
              type="number"
              min={1}
              max={90}
              required
              className="mt-1 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-sm"
              value={autoDays}
              onChange={(e) => setAutoDays(e.target.value)}
            />
            <span className="mt-0.5 block text-[11px] text-gray-400">1~90</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              정산 수수료(만분율, 300=3%){" "}
              {overridden?.store_settlement_fee_bp ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-gray-400">env</span>
              )}
            </span>
            <input
              type="number"
              min={0}
              max={10000}
              required
              className="mt-1 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-sm"
              value={feeBp}
              onChange={(e) => setFeeBp(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              정산 지급 예정(결제일+N일){" "}
              {overridden?.store_settlement_delay_days ? (
                <span className="text-signature">DB</span>
              ) : (
                <span className="text-gray-400">env</span>
              )}
            </span>
            <input
              type="number"
              min={0}
              max={365}
              required
              className="mt-1 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-sm"
              value={delayDays}
              onChange={(e) => setDelayDays(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-ui-rect bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "저장 중…" : "세 항목 저장"}
            </button>
          </div>
        </form>
      )}
      {!loading ? (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
            onClick={() =>
              void save({
                store_auto_complete_days: null,
                store_settlement_fee_bp: null,
                store_settlement_delay_days: null,
              })
            }
          >
            전부 DB에서 제거(env만 사용)
          </button>
        </div>
      ) : null}
    </div>
  );
}
