"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { useCallback, useEffect, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Row = {
  id: string;
  from_user_id: string;
  subject: string;
  content: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "미답변",
  answered: "답변함",
  closed: "종료",
  escalated: "이관",
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR");
}

export function OwnerStoreInquiriesView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preferredStoreId = (searchParams.get("storeId") ?? "").trim();
  const loginHref = "/login";

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "config" }
    | { kind: "no_store" }
    | { kind: "error"; message: string }
    | { kind: "ok"; storeId: string; storeName: string; rows: Row[] }
  >({ kind: "loading" });
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const { status: srStatus, json: rawStores } = await fetchMeStoresListDeduped();
      if (srStatus === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (srStatus === 503) {
        setState({ kind: "config" });
        return;
      }
      const sj = rawStores as { ok?: boolean; stores?: { id: string; store_name?: string }[] };
      if (!sj?.ok || !Array.isArray(sj.stores) || sj.stores.length === 0) {
        setState({ kind: "no_store" });
        return;
      }
      const stores = sj.stores as { id: string; store_name?: string }[];
      const store =
        preferredStoreId && stores.some((s) => s.id === preferredStoreId)
          ? stores.find((s) => s.id === preferredStoreId)!
          : stores[0];
      const ir = await fetch(`/api/me/stores/${encodeURIComponent(store.id)}/inquiries`, {
        credentials: "include",
      });
      const ij = await ir.json();
      if (!ij?.ok) {
        setState({
          kind: "error",
          message: typeof ij?.error === "string" ? ij.error : "load_failed",
        });
        return;
      }
      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? "내 매장"),
        rows: (ij.inquiries ?? []) as Row[],
      });
    } catch {
      setState({ kind: "error", message: "network_error" });
    }
  }, [preferredStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendAnswer(id: string) {
    if (state.kind !== "ok") return;
    const text = (draftById[id] ?? "").trim();
    if (!text) return;
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(state.storeId)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: text }),
        }
      );
      const json = await res.json();
      if (!json?.ok) return;
      setDraftById((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      await load();
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-answer",
        key: `${state.storeId}:${id}:answer`,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function closeThread(id: string) {
    if (state.kind !== "ok") return;
    if (!window.confirm("이 문의를 종료할까요?")) return;
    setBusyId(id);
    try {
      await fetch(
        `/api/me/stores/${encodeURIComponent(state.storeId)}/inquiries/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ close_only: true }),
        }
      );
      await load();
      dispatchOwnerHubBadgeRefresh({
        source: "owner-store-inquiries-close",
        key: `${state.storeId}:${id}:close`,
      });
    } finally {
      setBusyId(null);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }
  if (state.kind === "unauth") {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>로그인 후 고객 문의를 확인하고 바로 답변할 수 있습니다.</p>
        <Link href={loginHref} className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          로그인하고 문의 보기
        </Link>
      </div>
    );
  }
  if (state.kind === "config") {
    return <p className="text-sm text-sam-muted">서버 설정을 확인해 주세요.</p>;
  }
  if (state.kind === "no_store") {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>등록된 매장이 없습니다.</p>
        <Link href="/my/business/apply" className="mt-2 inline-block text-signature">
          매장 신청
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="text-sm text-red-600">({state.message})</p>
        <button type="button" onClick={() => void load()} className="text-sm text-signature underline">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <p className="text-sm text-sam-muted">{state.storeName}</p>
      {state.rows.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">받은 문의가 없습니다.</p>
      ) : (
        <ul className={OWNER_STORE_STACK_Y_CLASS}>
          {state.rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
              <p className="text-xs text-sam-muted">
                {STATUS_LABEL[r.status] ?? r.status} ·{" "}
                <span className="font-mono sam-text-xxs">{r.from_user_id}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-sam-fg">{r.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-sam-fg">{r.content}</p>
              <p className="mt-1 sam-text-xxs text-sam-meta">{formatDate(r.created_at)}</p>
              {r.answer ? (
                <div className="mt-2 rounded-ui-rect bg-sam-app px-3 py-2 text-sm text-sam-fg">
                  <span className="text-xs text-sam-muted">내 답변</span>
                  <p className="mt-1 whitespace-pre-wrap">{r.answer}</p>
                </div>
              ) : null}
              {r.status === "open" || r.status === "answered" ? (
                <div className="mt-3 space-y-2 border-t border-sam-border-soft pt-3">
                  <textarea
                    value={draftById[r.id] ?? ""}
                    onChange={(e) =>
                      setDraftById((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                    placeholder="답변을 입력하세요"
                    rows={3}
                    disabled={busyId !== null}
                    className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId !== null || !(draftById[r.id] ?? "").trim()}
                      onClick={() => void sendAnswer(r.id)}
                      className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "답변 등록"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void closeThread(r.id)}
                      className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm text-sam-fg"
                    >
                      종료
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
