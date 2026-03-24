"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  from_user_id: string;
  inquiry_type: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "미답변",
  answered: "답변됨",
  closed: "종료",
  escalated: "이관",
};

export function AdminStoreInquiriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-inquiries", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(json.inquiries ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 문의 모니터링" />
      <p className="text-[13px] text-gray-600">
        회원이 매장에 보낸 문의·오너 답변 상태를 조회합니다. 답변은 오너 화면(
        <code className="rounded bg-gray-100 px-1">/my/business/inquiries</code>)에서 처리합니다.
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">문의가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-2 text-[13px]">
                <span className="font-semibold text-gray-900">{r.store_name || r.store_id}</span>
                <span className="text-gray-500">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                문의자 <span className="font-mono">{r.from_user_id}</span> · {r.inquiry_type} ·{" "}
                {new Date(r.created_at).toLocaleString("ko-KR")}
              </p>
              <p className="mt-2 font-medium text-gray-900">{r.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{r.content}</p>
              {r.answer ? (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                  <p className="text-xs font-medium text-gray-500">매장 답변</p>
                  <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                  {r.answered_at ? (
                    <p className="mt-1 text-[11px] text-gray-400">
                      {new Date(r.answered_at).toLocaleString("ko-KR")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
