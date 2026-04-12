"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PointChargeRequest } from "@/lib/types/point";
import { PointChargeBadge } from "@/components/points/PointChargeBadge";
import { POINT_PAYMENT_METHOD_LABELS } from "@/lib/points/point-utils";
import Link from "next/link";

interface AdminPointChargeInlineActionsProps {
  requests: PointChargeRequest[];
}

export function AdminPointChargeInlineActions({ requests }: AdminPointChargeInlineActionsProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [memoInputs, setMemoInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const doAction = async (id: string, action: "approve" | "reject" | "hold", memo?: string) => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/point-charges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminMemo: memo }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "처리 실패");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-sam-meta">충전 신청 내역이 없습니다.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</p>
      ) : null}
      <table className="w-full min-w-[820px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-[12px]">
            {["신청자", "플랜/포인트", "결제방식", "입금자명", "상태", "신청일", "메모", "액션"].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold text-sam-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const busy = busyId === r.id;
            const canAct =
              r.requestStatus === "pending" ||
              r.requestStatus === "waiting_confirm" ||
              r.requestStatus === "on_hold";
            const memo = memoInputs[r.id] ?? r.adminMemo ?? "";
            return (
              <tr
                key={r.id}
                className={`border-b border-sam-border-soft hover:bg-sam-app ${
                  r.requestStatus === "waiting_confirm" ? "bg-amber-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/users/${r.userId}?tab=points`}
                    className="font-semibold text-sky-700 hover:underline"
                  >
                    {r.userNickname}
                  </Link>
                  <p className="text-[10px] text-sam-meta font-mono">{r.userId}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-sam-fg">{r.planName}</p>
                  <p className="text-[12px] text-sky-700 font-bold">+{r.pointAmount.toLocaleString()}P</p>
                  <p className="text-[11px] text-sam-muted">₱{r.paymentAmount.toLocaleString()}</p>
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {POINT_PAYMENT_METHOD_LABELS[r.paymentMethod]}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {r.depositorName || <span className="text-sam-meta">-</span>}
                </td>
                <td className="px-3 py-2.5">
                  <PointChargeBadge status={r.requestStatus} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {new Date(r.requestedAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) =>
                      setMemoInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    placeholder="관리자 메모"
                    className="w-28 rounded border border-sam-border px-2 py-1 text-[11px] outline-none focus:border-sky-300"
                  />
                </td>
                <td className="px-3 py-2.5">
                  {canAct ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(r.id, "approve", memo)}
                        className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "…" : "승인"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(r.id, "reject", memo)}
                        className="rounded bg-red-500 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        반려
                      </button>
                      {r.requestStatus !== "on_hold" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(r.id, "hold", memo)}
                          className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-[11px] text-sam-muted disabled:opacity-50"
                        >
                          보류
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-sam-meta">처리완료</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
