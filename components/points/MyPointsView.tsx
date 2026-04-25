"use client";

import { useCallback, useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
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
      const res = await runSingleFlight("me:points:get", () => fetch("/api/me/points", { cache: "no-store" }));
      const j = (await res.clone().json()) as {
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
    <div className="min-h-screen bg-sam-app pb-28">
      {/* 잔액 헤더 카드 */}
      <div className="bg-gradient-to-br from-sky-600 to-sky-700 px-5 pb-8 pt-6">
        <p className="sam-text-body-secondary font-medium text-sky-200">내 포인트 잔액</p>
        {loading ? (
          <p className="mt-2 sam-text-hero font-bold text-white">…</p>
        ) : (
          <p className="mt-1 sam-text-hero font-bold text-white">{balance.toLocaleString()}P</p>
        )}
        <button
          type="button"
          onClick={() => setShowChargeForm(true)}
          className="mt-4 rounded-ui-rect border border-sam-surface/40 bg-sam-surface/20 px-4 py-2 sam-text-body font-semibold text-white backdrop-blur hover:bg-sam-surface/30"
        >
          + 포인트 충전 신청
        </button>
        {pendingCharges > 0 && (
          <p className="mt-2 sam-text-helper text-sky-200">
            처리 대기 중인 충전 신청 {pendingCharges}건
          </p>
        )}
      </div>

      {/* 탭 */}
      <div className="sticky top-0 z-10 flex gap-0 border-b border-sam-border bg-sam-surface">
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
            className={`flex-1 py-3 sam-text-body-secondary font-semibold transition-colors ${
              activeTab === id
                ? "border-b-2 border-sky-600 text-sky-700"
                : "text-sam-muted hover:text-sam-fg"
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
                <div key={label} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 text-center shadow-sm">
                  <p className={`sam-text-page-title font-bold ${color}`}>{value}</p>
                  <p className="mt-1 sam-text-xxs text-sam-muted">{label}</p>
                </div>
              ))}
            </div>

            {/* 최근 원장 5건 */}
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
              <div className="border-b border-sam-border-soft px-4 py-3">
                <h3 className="sam-text-body font-semibold text-sam-fg">최근 포인트 내역</h3>
              </div>
              {ledger.length === 0 ? (
                <p className="py-8 text-center sam-text-body-secondary text-sam-meta">내역이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-sam-border-soft">
                  {ledger.slice(0, 5).map((l) => (
                    <li key={l.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="sam-text-body-secondary font-medium text-sam-fg">
                          {LEDGER_TYPE_LABELS[l.entryType] ?? l.entryType}
                        </p>
                        <p className="sam-text-xxs text-sam-muted">{l.description}</p>
                        <p className="sam-text-xxs text-sam-meta">
                          {new Date(l.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`sam-text-body font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                        </p>
                        <p className="sam-text-xxs text-sam-meta">잔액 {l.balanceAfter.toLocaleString()}P</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {ledger.length > 5 && (
                <div className="border-t border-sam-border-soft px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ledger")}
                    className="sam-text-helper text-sky-700 underline"
                  >
                    전체 내역 보기
                  </button>
                </div>
              )}
            </div>

            {/* 충전 신청 현황 */}
            {charges.length > 0 && (
              <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
                <div className="border-b border-sam-border-soft px-4 py-3">
                  <h3 className="sam-text-body font-semibold text-sam-fg">충전 신청 현황</h3>
                </div>
                <ul className="divide-y divide-sam-border-soft">
                  {charges.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="sam-text-body-secondary font-medium text-sam-fg">{c.planName}</p>
                        <p className="sam-text-xxs text-sam-meta">
                          {new Date(c.requestedAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="sam-text-body font-bold text-sky-700">+{c.pointAmount.toLocaleString()}P</p>
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
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
            {ledger.length === 0 ? (
              <p className="py-10 text-center sam-text-body-secondary text-sam-meta">포인트 내역이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-sam-border-soft">
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-start justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${
                            l.amount >= 0
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {LEDGER_TYPE_LABELS[l.entryType] ?? l.entryType}
                        </span>
                        <p className="truncate sam-text-body-secondary font-medium text-sam-fg">{l.description}</p>
                      </div>
                      <p className="mt-0.5 sam-text-xxs text-sam-meta">
                        {new Date(l.createdAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className={`sam-text-body font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                      </p>
                      <p className="sam-text-xxs text-sam-meta">{l.balanceAfter.toLocaleString()}P</p>
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
              className="w-full rounded-ui-rect bg-sky-600 py-3.5 sam-text-body font-bold text-white shadow-md"
            >
              + 포인트 충전 신청하기
            </button>

            {charges.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-10 text-center sam-text-body-secondary text-sam-meta">
                충전 신청 내역이 없습니다.
              </div>
            ) : (
              <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
                <ul className="divide-y divide-sam-border-soft">
                  {charges.map((c) => (
                    <li key={c.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="sam-text-body font-semibold text-sam-fg">{c.planName}</p>
                          <dl className="mt-1 space-y-0.5 sam-text-helper text-sam-muted">
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
                          <p className="sam-text-body-lg font-bold text-sky-700">+{c.pointAmount.toLocaleString()}P</p>
                          <PointChargeBadge status={c.requestStatus} />
                          {(c.requestStatus === "pending" || c.requestStatus === "waiting_confirm") && (
                            <button
                              type="button"
                              disabled={cancelling === c.id}
                              onClick={() => void cancelCharge(c.id)}
                              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-muted disabled:opacity-50"
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
