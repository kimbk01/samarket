"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CampaignRow = {
  id: string;
  title: string;
  type: string;
  target_type: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
};

export function AdminNotificationCampaignsPage() {
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (status !== "all") sp.set("status", status);
      if (type !== "all") sp.set("type", type);
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/notification-campaigns?${sp.toString()}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; campaigns?: CampaignRow[]; error?: string };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "목록을 불러오지 못했습니다.");
        setRows([]);
        return;
      }
      setRows(j.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, type, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-sam-fg">푸시·인앱 알림 캠페인</h1>
        <Link
          href="/admin/notifications/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-sm font-medium text-white"
        >
          새 캠페인
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">상태 · 전체</option>
          <option value="draft">임시저장</option>
          <option value="scheduled">예약</option>
          <option value="sent">발송완료</option>
          <option value="failed">실패</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">유형 · 전체</option>
          <option value="notice">공지</option>
          <option value="marketing">마케팅</option>
          <option value="system">시스템</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 검색"
          className="min-w-[160px] flex-1 rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm"
        >
          조회
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-3 py-2">제목</th>
                <th className="px-3 py-2">유형</th>
                <th className="px-3 py-2">대상</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">발송일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 font-medium text-sam-fg">
                    <Link href={`/admin/notifications/${r.id}`} className="hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">{r.target_type}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.sent_at ? r.sent_at.slice(0, 16) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sam-muted">
                    캠페인이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
