"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";

const STATUS_LABEL: Record<string, string> = {
  open: "접수",
  reviewing: "검토중",
  resolved: "처리완료",
  dismissed: "기각",
};

export function AdminCommunityReportDetailClient({ initialRow }: { initialRow: CommunityReportAdminRow }) {
  const router = useRouter();
  const [row, setRow] = useState(initialRow);
  const [memo, setMemo] = useState(row.admin_memo ?? "");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(row.id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; row?: CommunityReportAdminRow };
    if (j.ok && j.row) {
      setRow(j.row);
      setMemo(j.row.admin_memo ?? "");
    }
    router.refresh();
  }

  async function patchStatus(status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          admin_memo: memo.trim() ? memo.trim().slice(0, 2000) : null,
        }),
      });
      const j = (await res.json()) as { ok?: boolean };
      if (j.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="피드 신고 상세" backHref="/admin/reports" description="community_reports · 통합 신고 목록과 동일 id" />

      <AdminCard title="신고 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd className="font-mono text-[12px] text-gray-900">{row.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">대상</dt>
            <dd className="font-mono text-[12px]">
              {row.target_type} · {row.target_id}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">글</dt>
            <dd>
              {row.target_type === "post" && row.post_title ? (
                <Link
                  href={`/community/post/${row.target_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {row.post_title}
                </Link>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">신고자</dt>
            <dd className="font-mono text-[12px]">{row.reporter_id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">사유 코드</dt>
            <dd>{row.reason_type}</dd>
          </div>
          <div>
            <dt className="text-gray-500">내용</dt>
            <dd className="whitespace-pre-wrap text-[13px] text-gray-700">{row.reason_text ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[12px]">
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">접수일</dt>
            <dd>{row.created_at ? new Date(row.created_at).toLocaleString("ko-KR") : "—"}</dd>
          </div>
          {row.processed_at ? (
            <div>
              <dt className="text-gray-500">처리 시각</dt>
              <dd>{new Date(row.processed_at).toLocaleString("ko-KR")}</dd>
            </div>
          ) : null}
        </dl>
      </AdminCard>

      <AdminCard title="관리자 메모 · 상태">
        <label className="mb-3 flex flex-col gap-1 text-[13px]">
          <span className="text-gray-600">메모</span>
          <textarea
            className="min-h-[100px] rounded border border-gray-200 px-2 py-2"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="내부 메모 (선택)"
          />
        </label>
        <p className="mb-2 text-[12px] text-gray-500">상태 변경 시 위 메모가 함께 저장됩니다.</p>
        <div className="flex flex-wrap gap-2">
          {(["open", "reviewing", "resolved", "dismissed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || row.status === s}
              onClick={() => void patchStatus(s)}
              className="rounded border border-gray-200 px-3 py-1.5 text-[13px] hover:bg-gray-50 disabled:opacity-40"
            >
              {STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[13px]">
          <Link href="/admin/community/reports" className="text-blue-600 hover:underline">
            피드 신고 목록으로
          </Link>
        </p>
      </AdminCard>
    </div>
  );
}
