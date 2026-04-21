"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
  escalated: "운영 이관",
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR");
}

export function MyStoreInquiriesView() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | { kind: "ok"; rows: Row[] }
  >({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/store-inquiries", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      const json = await res.json();
      if (!json?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof json?.error === "string" ? json.error : "load_failed",
          });
        }
        return;
      }
      setState({ kind: "ok", rows: (json.inquiries ?? []) as Row[] });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }
  if (state.kind === "unauth") {
    return <p className="text-sm text-sam-muted">로그인 후 문의 내역을 확인할 수 있습니다.</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">({state.message})</p>
        <button type="button" onClick={() => void load({ silent: false })} className="text-sm text-signature underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (state.rows.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-center text-sm text-sam-muted shadow-sm">
        <p>보낸 문의가 없습니다.</p>
        <Link href="/stores" className="mt-3 inline-block text-signature">
          매장 둘러보기
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.rows.map((r) => (
        <li key={r.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          <p className="sam-text-body font-semibold text-sam-fg">{r.store_name || "매장"}</p>
          <p className="mt-1 text-sm font-medium text-sam-fg">{r.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-sam-muted">{r.content}</p>
          <p className="mt-2 text-xs text-sam-muted">
            {STATUS_LABEL[r.status] ?? r.status} · {formatDate(r.created_at)}
          </p>
          {r.answer ? (
            <div className="mt-3 rounded-ui-rect bg-sam-app px-3 py-2">
              <p className="text-xs font-medium text-sam-muted">매장 답변</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{r.answer}</p>
              {r.answered_at ? (
                <p className="mt-1 sam-text-xxs text-sam-meta">{formatDate(r.answered_at)}</p>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
