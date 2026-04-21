"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPostAdRow, AdApplyStatus } from "@/lib/ads/types";
import { AD_APPLY_STATUS_LABELS, AD_TYPE_LABELS } from "@/lib/ads/types";
import { AdStatusBadge } from "@/components/ads/AdStatusBadge";

const STATUS_OPTIONS: { value: AdApplyStatus; label: string }[] = [
  { value: "pending_review", label: "승인대기" },
  { value: "active", label: "노출중" },
  { value: "rejected", label: "반려" },
  { value: "expired", label: "만료" },
  { value: "cancelled", label: "취소" },
];

interface AdminAdTableProps {
  rows: AdminPostAdRow[];
}

export function AdminAdTable({ rows }: AdminAdTableProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const doAction = async (
    adId: string,
    action: "approve" | "reject" | "cancel" | "expire",
    note?: string
  ) => {
    setBusyId(adId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: note }),
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

  if (rows.length === 0) {
    return <p className="py-8 text-center sam-text-body-secondary text-sam-muted">광고 신청 내역이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
      ) : null}
      <table className="w-full min-w-[800px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {["게시글", "광고주", "게시판", "상품", "유형", "상태", "포인트", "기간", "신청일", "액션"].map(
              (h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-sam-muted">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = busyId === row.id;
            const note = noteInputs[row.id] ?? "";
            return (
              <tr key={row.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="max-w-[160px] truncate px-3 py-2 font-medium text-sam-fg">
                  {row.postTitle}
                </td>
                <td className="px-3 py-2 text-sam-fg">{row.userNickname}</td>
                <td className="px-3 py-2 text-sam-muted">{row.boardKey}</td>
                <td className="px-3 py-2 text-sam-fg">{row.adProductName}</td>
                <td className="px-3 py-2 text-sam-muted">{AD_TYPE_LABELS[row.adType]}</td>
                <td className="px-3 py-2">
                  <AdStatusBadge status={row.applyStatus} />
                </td>
                <td className="px-3 py-2 text-right text-sam-fg">
                  {row.pointCost.toLocaleString()}P
                </td>
                <td className="px-3 py-2 text-sam-muted">
                  {row.startAt
                    ? `${new Date(row.startAt).toLocaleDateString("ko-KR")}~${new Date(row.endAt ?? "").toLocaleDateString("ko-KR")}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-sam-muted">
                  {new Date(row.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) =>
                        setNoteInputs((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder="관리자 메모"
                      className="w-36 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                    <div className="flex flex-wrap gap-1">
                      {row.applyStatus === "pending_review" || row.applyStatus === "pending_payment" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void doAction(row.id, "approve", note)}
                            className="rounded bg-emerald-600 px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void doAction(row.id, "reject", note)}
                            className="rounded bg-red-500 px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                          >
                            반려
                          </button>
                        </>
                      ) : null}
                      {row.applyStatus === "active" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "expire", note)}
                          className="rounded bg-sam-muted px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                        >
                          강제종료
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "cancel", note)}
                        className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-muted disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
