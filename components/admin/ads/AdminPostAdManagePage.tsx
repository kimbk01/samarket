"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdStatusBadge } from "@/components/ads/AdStatusBadge";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AD_TYPE_LABELS, AD_APPLY_STATUS_LABELS } from "@/lib/ads/types";
import type { AdminPostAdRow, AdApplyStatus } from "@/lib/ads/types";
import Link from "next/link";

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "pending_review", label: "승인대기" },
  { value: "active", label: "노출중" },
  { value: "rejected", label: "반려" },
  { value: "expired", label: "만료" },
  { value: "cancelled", label: "취소" },
];

export function AdminPostAdManagePage() {
  const [rows, setRows] = useState<AdminPostAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ads", { cache: "no-store" });
      const j = (await res.json()) as { ads?: AdminPostAdRow[] };
      setRows(j.ads ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.applyStatus === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.applyStatus === "active").length,
    pending: rows.filter((r) =>
      r.applyStatus === "pending_review" || r.applyStatus === "pending_payment"
    ).length,
    rejected: rows.filter((r) => r.applyStatus === "rejected").length,
  }), [rows]);

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
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="광고 신청 관리" />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "전체", value: counts.total, color: "text-sam-fg" },
          { label: "노출중", value: counts.active, color: "text-emerald-700" },
          { label: "승인대기", value: counts.pending, color: "text-blue-700" },
          { label: "반려", value: counts.rejected, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className={`sam-text-hero font-bold ${color}`}>{value}</p>
            <p className="sam-text-xxs text-sam-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* 승인 대기 강조 배너 */}
      {counts.pending > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-blue-300 bg-blue-50 px-4 py-3 sam-text-body-secondary text-blue-900">
          <span className="sam-text-body-lg">⏳</span>
          <span>
            관리자 승인 대기 중인 광고 신청 <strong>{counts.pending}건</strong>이 있습니다.
          </span>
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full px-3 py-1.5 sam-text-helper font-medium transition-colors ${
              statusFilter === opt.value
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-muted hover:bg-sam-app"
        >
          새로고침
        </button>
      </div>

      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
      ) : null}

      {/* 목록 */}
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            광고 신청 목록{" "}
            <span className="sam-text-body-secondary font-normal text-sam-meta">({filtered.length}건)</span>
          </h2>
        </div>

        {loading ? (
          <p className="py-12 text-center sam-text-body-secondary text-sam-meta">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center sam-text-body-secondary text-sam-meta">
            {statusFilter ? "해당 상태의 광고 신청이 없습니다." : "광고 신청 내역이 없습니다."}
          </p>
        ) : (
          <div className="divide-y divide-sam-border-soft">
            {filtered.map((row) => {
              const busy = busyId === row.id;
              const note = noteInputs[row.id] ?? row.adminNote ?? "";
              const canApprove =
                row.applyStatus === "pending_review" ||
                row.applyStatus === "pending_payment";
              const canExpire = row.applyStatus === "active";

              return (
                <div
                  key={row.id}
                  className={`px-4 py-4 ${
                    canApprove ? "bg-blue-50/30" : ""
                  }`}
                >
                  {/* 상단: 제목 + 상태 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AdStatusBadge status={row.applyStatus} />
                        <span className="truncate sam-text-body font-semibold text-sam-fg">
                          {row.postTitle}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 sam-text-helper text-sam-muted">
                        <span>광고주: <strong className="text-sam-fg">{row.userNickname}</strong></span>
                        <span>게시판: {row.boardKey}</span>
                        <span>{AD_TYPE_LABELS[row.adType]}</span>
                        <span className="font-semibold text-sky-700">{row.pointCost.toLocaleString()}P</span>
                        {row.startAt && row.endAt ? (
                          <span>
                            {new Date(row.startAt).toLocaleDateString("ko-KR")} ~{" "}
                            {new Date(row.endAt).toLocaleDateString("ko-KR")}
                          </span>
                        ) : null}
                        <span className="text-sam-meta">
                          신청: {new Date(row.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="mt-0.5 sam-text-helper text-sam-muted">
                        상품: {row.adProductName}
                      </p>
                    </div>
                  </div>

                  {/* 관리자 메모 + 액션 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) =>
                        setNoteInputs((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder="관리자 메모 (선택)"
                      className="w-48 rounded-ui-rect border border-sam-border px-2.5 py-1.5 sam-text-helper outline-none focus:border-sky-300"
                    />

                    {canApprove && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "approve", note)}
                          className="rounded-ui-rect bg-emerald-600 px-3 py-1.5 sam-text-helper font-bold text-white disabled:opacity-50"
                        >
                          {busy ? "처리중…" : "승인"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void doAction(row.id, "reject", note)}
                          className="rounded-ui-rect bg-red-500 px-3 py-1.5 sam-text-helper font-bold text-white disabled:opacity-50"
                        >
                          반려
                        </button>
                      </>
                    )}
                    {canExpire && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "expire", note)}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg disabled:opacity-50"
                      >
                        강제 종료
                      </button>
                    )}
                    {row.applyStatus !== "cancelled" && row.applyStatus !== "expired" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doAction(row.id, "cancel", note)}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-muted disabled:opacity-50"
                      >
                        취소
                      </button>
                    )}

                    {/* 광고주 포인트 내역 바로가기 */}
                    <Link
                      href={`/admin/users/${row.userId}?tab=points`}
                      className="ml-auto rounded-ui-rect border border-sam-border px-2.5 py-1.5 sam-text-xxs text-sam-muted hover:text-sky-700"
                    >
                      광고주 포인트 조회
                    </Link>
                  </div>

                  {/* 반려 메모 표시 */}
                  {row.adminNote && row.applyStatus === "rejected" && (
                    <p className="mt-2 rounded-ui-rect bg-red-50 px-2 py-1.5 sam-text-xxs text-red-700">
                      반려 사유: {row.adminNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
