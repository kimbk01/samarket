"use client";

import { useCallback, useEffect, useState } from "react";
import type { PointLedgerEntry, PointChargeRequest } from "@/lib/types/point";
import { PointChargeBadge } from "@/components/points/PointChargeBadge";
import { AdminCard } from "@/components/admin/AdminCard";
import { useRouter } from "next/navigation";

interface AdminUserPointsSectionProps {
  userId: string;
}

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

export function AdminUserPointsSection({ userId }: AdminUserPointsSectionProps) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<PointLedgerEntry[]>([]);
  const [charges, setCharges] = useState<PointChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"ledger" | "charges">("charges");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/points`);
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
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doAction = async (reqId: string, action: "approve" | "reject" | "hold") => {
    setBusy(reqId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/point-charges/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "처리 실패");
        return;
      }
      void load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <AdminCard title="포인트">
        <p className="text-[13px] text-gray-400">불러오는 중…</p>
      </AdminCard>
    );
  }

  const pendingCount = charges.filter(
    (c) => c.requestStatus === "pending" || c.requestStatus === "waiting_confirm" || c.requestStatus === "on_hold"
  ).length;

  return (
    <AdminCard title="포인트 관리">
      {/* 잔액 + 바로가기 */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-sky-50 px-4 py-3">
        <div>
          <p className="text-[12px] text-sky-700">포인트 잔액</p>
          <p className="text-[24px] font-bold text-sky-800">{(balance ?? 0).toLocaleString()}P</p>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[12px] font-bold text-white">
            신청 {pendingCount}건 대기
          </span>
        )}
      </div>

      {err ? <p className="mb-2 text-[12px] text-red-600">{err}</p> : null}

      {/* 탭 */}
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["charges", "ledger"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {t === "charges" ? `충전 신청 (${charges.length})` : `원장 (${ledger.length})`}
          </button>
        ))}
      </div>

      {/* 충전 신청 목록 */}
      {tab === "charges" && (
        <div>
          {charges.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-400">충전 신청 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {charges.map((c) => {
                const canAct =
                  c.requestStatus === "pending" ||
                  c.requestStatus === "waiting_confirm" ||
                  c.requestStatus === "on_hold";
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border px-3 py-3 ${
                      c.requestStatus === "waiting_confirm"
                        ? "border-amber-200 bg-amber-50"
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900">{c.planName}</p>
                        <p className="text-[12px] text-sky-700 font-bold">+{c.pointAmount.toLocaleString()}P</p>
                        <p className="text-[11px] text-gray-500">
                          ₱{c.paymentAmount.toLocaleString()} ·{" "}
                          {c.paymentMethod === "manual_confirm" ? "계좌입금" : "이체"}
                          {c.depositorName ? ` · ${c.depositorName}` : ""}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(c.requestedAt).toLocaleString("ko-KR")}
                        </p>
                        {c.adminMemo && (
                          <p className="mt-1 text-[11px] text-amber-700">메모: {c.adminMemo}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <PointChargeBadge status={c.requestStatus} />
                        {canAct && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={busy === c.id}
                              onClick={() => void doAction(c.id, "approve")}
                              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                            >
                              승인
                            </button>
                            <button
                              type="button"
                              disabled={busy === c.id}
                              onClick={() => void doAction(c.id, "reject")}
                              className="rounded bg-red-500 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                            >
                              반려
                            </button>
                            {c.requestStatus !== "on_hold" && (
                              <button
                                type="button"
                                disabled={busy === c.id}
                                onClick={() => void doAction(c.id, "hold")}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 disabled:opacity-50"
                              >
                                보류
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 포인트 원장 */}
      {tab === "ledger" && (
        <div>
          {ledger.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-400">원장 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {ledger.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          l.amount >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {LEDGER_TYPE_LABELS[l.entryType] ?? l.entryType}
                      </span>
                      <p className="truncate text-[12px] text-gray-800">{l.description}</p>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {new Date(l.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <p className={`text-[13px] font-bold ${l.amount >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {l.amount >= 0 ? "+" : ""}{l.amount.toLocaleString()}P
                    </p>
                    <p className="text-[10px] text-gray-400">{l.balanceAfter.toLocaleString()}P</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminCard>
  );
}
