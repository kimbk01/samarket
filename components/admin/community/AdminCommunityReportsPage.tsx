"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";

export function AdminCommunityReportsPage({
  initialRows,
  highlightId = "",
}: {
  initialRows: CommunityReportAdminRow[];
  highlightId?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState("");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    const id = highlightId.trim();
    if (!id) return;
    const el = rowRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-amber-50");
      const t = window.setTimeout(() => el.classList.remove("bg-amber-50"), 2500);
      return () => window.clearTimeout(t);
    }
  }, [highlightId, rows]);

  const patch = async (id: string, status: string) => {
    setBusyId(id);
    setPatchErr("");
    try {
      const res = await fetch(`/api/admin/community-reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        router.refresh();
      } else {
        setPatchErr(j.error ?? `상태 변경 실패 (${res.status})`);
      }
    } catch {
      setPatchErr("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="커뮤니티 피드 신고" backHref="/admin/philife/topics" />
      <AdminCard title="community_reports">
        <p className="mb-3 text-[13px] text-sam-muted">
          사용자가 피드 글에서 접수한 신고입니다. 글 제목을 누르면 앱 상세로 이동합니다.
        </p>
        {patchErr ? (
          <p className="mb-2 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{patchErr}</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-[13px] text-sam-muted">접수된 신고가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium">일시</th>
                  <th className="py-2 pr-2 font-medium">대상</th>
                  <th className="py-2 pr-2 font-medium">글/대상</th>
                  <th className="py-2 pr-2 font-medium">사유</th>
                  <th className="py-2 pr-2 font-medium">상태</th>
                  <th className="py-2 font-medium">처리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    ref={(el) => {
                      rowRefs.current[r.id] = el;
                    }}
                    className="border-b border-sam-border-soft align-top transition-colors duration-500"
                  >
                    <td className="py-2 pr-2 whitespace-nowrap text-sam-muted">
                      {r.created_at ? new Date(r.created_at).toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="py-2 pr-2 font-mono text-[11px]">
                      {r.target_type}
                      <br />
                      <span className="text-sam-meta">{r.target_id.slice(0, 8)}…</span>
                    </td>
                    <td className="py-2 pr-2 max-w-[200px]">
                      {r.target_type === "post" && r.post_title ? (
                        <Link
                          href={`/philife/${r.target_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {r.post_title}
                        </Link>
                      ) : (
                        <span className="text-sam-meta">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-sam-fg">
                      <span className="font-medium text-sam-muted">{r.reason_type}</span>
                      {r.reason_text ? <p className="mt-0.5 line-clamp-2 text-[11px]">{r.reason_text}</p> : null}
                    </td>
                    <td className="py-2 pr-2">{r.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(["reviewing", "resolved", "dismissed"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={busyId === r.id || r.status === s}
                            onClick={() => void patch(r.id, s)}
                            className="rounded border border-sam-border px-2 py-0.5 text-[11px] hover:bg-sam-app disabled:opacity-40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
