"use client";

import { useCallback, useEffect, useState } from "react";
import type { PointLedgerEntry, PointChargeRequest } from "@/lib/types/point";
import { PointChargeBadge } from "./PointChargeBadge";
import { PointChargeForm } from "./PointChargeForm";
import { getPointPlans } from "@/lib/points/mock-point-plans";

type Tab = "balance" | "ledger" | "charges";

const LEDGER_TYPE_LABELS: Record<string, string> = {
  charge: "충전",
  spend: "사용",
  refund: "환불",
  admin_adjust: "관리자조정",
  expire: "만료",
  reward: "보상",
  reverse: "취소",
  ad_purchase: "광고구매",
  ad_refund: "광고환불",
};

export function MyPointsView() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<PointLedgerEntry[]>([]);
  const [charges, setCharges] = useState<PointChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("balance");
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const plans = getPointPlans();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/points", { cache: "no-store" });
      const j = (await res.json()) as {
        balance?: number;
        ledger?: PointLedgerEntry[];
        chargeRequests?: PointChargeRequest[];
      };
      setBalance(j.balance ?? 0);
      setLedger(j.ledger ?? []);
      setCharges(j.chargeRequests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelCharge = async (id: string) => {
    setCancelling(id);
    try {
      const res = await fetch(`/api/me/points/charge/${id}/cancel`, { method: "POST" });
      const j = (await res.json()) as { ok?: boolean };
      if (res.ok && j.ok) void load();
    } finally {
      setCancelling(null);
    }
  };

  const pendingCharges = charges.filter(
    (c) => c.requestStatus === "pending" || c.requestStatus === "waiting_confirm" || c.requestStatus === "on_hold"
  ).length;

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-28">
      {/* 잔액 헤더 카드 */}
      <div className="bg-gradient-to-br from-sky-600 to-sky-700 px-5 pb-8 pt-6">
        <p className="text-[13px] font-medium text-sky-200">내 포인트 잔액</p>
        {loading ? (
          <p className="mt-2 text-[32px] font-bold text-white">…</p>
        ) : (
          <p className="mt-1 text-[36px] font-bold text-white">{balance.toLocaleString()}P</p>
        )}
        <button
          type="button"
          onClick={() => setShowChargeForm(true)}
          className="mt-4 rounded-xl border border-white/40 bg-white/20 px-4 py-2 text-[14px] font-semibold text-white backdrop-blur hover:bg-white/30"
        >
          + 포인트 충전 신청
        </button>
        {pendingCharges > 0 && (
          <p className="mt-2 text-[12px] text-sky-200">
            처리 대기 중인 충전 신청 {pendingCharges}건
          </p>
        )}
      </div>

      {/* 탭 */}
      <div className="sticky top-0 z-10 flex gap-0 border-b border-gray-200 bg-white">
        {(
          [
            { id: "balance", label: "내역 요약" },
            { id: "ledger", label: "원장" },
            { id: "charges", label: `충전신청 ${charges.length > 0 ? `(${charges.length})` : ""}` },
          ] as { id: Tab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
              activeTab === id
                ? "border-b-2 border-sky-600 text-sky-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {/* ── 잔액 요약 탭 ── */}
        {activeTab === "balance" && (
          <div className="space-y-3">
            {/* 최근 사용/충전 요약 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "최근 충전 합계",
                  value: ledger
                    .filter((l) => l.entryType === "charge")
                    .reduce((s, l) => s + l.amount, 0)
                    .toLocaleString() + "P",
                  color: "text-emerald-700",
                },
                {
                  label: "최근 사용 합계",
                  value: ledger
                    .filter((l) => l.entryType === "spend" || l.entryType === "ad_purchase")
                    .reduce((s, l) => s + Math.abs(l.amount), 0)
                    .toLocaleString() + "P",
                  color: "text-red-600",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-center shadow-sm">
                  <p className={`text-[18px] font-bold ${color}`}>{value}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            {/* 최근 원장 5건 */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-[14px] font-semibold text-gray-900">최근 포인트 내역</h3>
              </div>
              {ledger.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-gray-400">내역이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {ledger.slice(0, 5).map((l) => (
                    <li key={l.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-[13px] font-medium text-gray-900">
                          {LEDGER_TYPE_LABELS[l.entryType] ?? l.entryType}
                        </p>
                        <p className="text-[11px] text-gray-500">{l.description}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(l.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[15px] font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                        </p>
                        <p className="text-[11px] text-gray-400">잔액 {l.balanceAfter.toLocaleString()}P</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {ledger.length > 5 && (
                <div className="border-t border-gray-100 px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ledger")}
                    className="text-[12px] text-sky-700 underline"
                  >
                    전체 내역 보기
                  </button>
                </div>
              )}
            </div>

            {/* 충전 신청 현황 */}
            {charges.length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-[14px] font-semibold text-gray-900">충전 신청 현황</h3>
                </div>
                <ul className="divide-y divide-gray-50">
                  {charges.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-[13px] font-medium text-gray-900">{c.planName}</p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(c.requestedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-[14px] font-bold text-sky-700">+{c.pointAmount.toLocaleString()}P</p>
                        <PointChargeBadge status={c.requestStatus} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── 원장 탭 ── */}
        {activeTab === "ledger" && (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            {ledger.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-gray-400">포인트 내역이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-start justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            l.amount >= 0
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {LEDGER_TYPE_LABELS[l.entryType] ?? l.entryType}
                        </span>
                        <p className="truncate text-[13px] font-medium text-gray-900">{l.description}</p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {new Date(l.createdAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className={`text-[14px] font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                      </p>
                      <p className="text-[11px] text-gray-400">{l.balanceAfter.toLocaleString()}P</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── 충전 신청 탭 ── */}
        {activeTab === "charges" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowChargeForm(true)}
              className="w-full rounded-2xl bg-sky-600 py-3.5 text-[15px] font-bold text-white shadow-md"
            >
              + 포인트 충전 신청하기
            </button>

            {charges.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-[13px] text-gray-400">
                충전 신청 내역이 없습니다.
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                <ul className="divide-y divide-gray-50">
                  {charges.map((c) => (
                    <li key={c.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-gray-900">{c.planName}</p>
                          <dl className="mt-1 space-y-0.5 text-[12px] text-gray-500">
                            <div className="flex gap-2">
                              <dt className="w-16 shrink-0">결제 방식</dt>
                              <dd>{c.paymentMethod === "manual_confirm" ? "계좌 입금" : "이체"}</dd>
                            </div>
                            {c.depositorName ? (
                              <div className="flex gap-2">
                                <dt className="w-16 shrink-0">입금자명</dt>
                                <dd>{c.depositorName}</dd>
                              </div>
                            ) : null}
                            <div className="flex gap-2">
                              <dt className="w-16 shrink-0">신청일</dt>
                              <dd>{new Date(c.requestedAt).toLocaleString("ko-KR")}</dd>
                            </div>
                            {c.adminMemo ? (
                              <div className="flex gap-2">
                                <dt className="w-16 shrink-0 text-amber-600">관리자 메모</dt>
                                <dd className="text-amber-700">{c.adminMemo}</dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <p className="text-[16px] font-bold text-sky-700">+{c.pointAmount.toLocaleString()}P</p>
                          <PointChargeBadge status={c.requestStatus} />
                          {(c.requestStatus === "pending" || c.requestStatus === "waiting_confirm") && (
                            <button
                              type="button"
                              disabled={cancelling === c.id}
                              onClick={() => void cancelCharge(c.id)}
                              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 disabled:opacity-50"
                            >
                              {cancelling === c.id ? "취소중…" : "신청 취소"}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {showChargeForm && (
        <PointChargeForm
          plans={plans}
          onSuccess={() => {
            setShowChargeForm(false);
            void load();
          }}
          onClose={() => setShowChargeForm(false)}
        />
      )}
    </div>
  );
}
