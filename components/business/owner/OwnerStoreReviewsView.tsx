"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";

type ReviewRow = {
  id: string;
  order_id: string;
  buyer_public_label: string;
  rating: number;
  content: string;
  status: string;
  visible_to_public: boolean;
  image_urls: string[];
  created_at: string;
  owner_reply_content: string | null;
  owner_reply_created_at: string | null;
};

export function OwnerStoreReviewsView() {
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string>("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sidQuery = searchParams.get("storeId")?.trim() ?? "";
      let sid = sidQuery;
      if (!sid) {
        const { status, json } = await fetchMeStoresListDeduped();
        const j = json as { ok?: boolean; stores?: { id: string }[] };
        if (status === 401) {
          setErr("로그인이 필요합니다.");
          setRows([]);
          return;
        }
        sid = j?.ok && Array.isArray(j.stores) && j.stores[0]?.id ? j.stores[0].id : "";
      }
      if (!sid) {
        setErr("매장을 찾을 수 없습니다.");
        setRows([]);
        return;
      }
      setStoreId(sid);

      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/reviews`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reviews?: ReviewRow[];
      };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        setRows([]);
        return;
      }
      const list = Array.isArray(j.reviews) ? j.reviews : [];
      setRows(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (!(r.id in next)) next[r.id] = r.owner_reply_content ?? "";
        }
        return next;
      });
    } catch {
      setErr("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveReply = useCallback(
    async (reviewId: string) => {
      const sid = storeId.trim();
      const draft = (drafts[reviewId] ?? "").trim();
      if (!sid || !reviewId || !draft) return;
      setBusyId(reviewId);
      try {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(sid)}/reviews/${encodeURIComponent(reviewId)}/reply`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply: draft }),
          }
        );
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j?.ok) {
          setErr(typeof j?.error === "string" ? j.error : "reply_failed");
          return;
        }
        await load();
      } catch {
        setErr("network_error");
      } finally {
        setBusyId(null);
      }
    },
    [drafts, load, storeId]
  );

  if (loading) return <p className="text-sm text-gray-500">불러오는 중…</p>;
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-500">리뷰가 없습니다.</p>;

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <p className="text-[13px] text-gray-500">배달 완료 주문 리뷰 목록입니다. 사장님 댓글을 남길 수 있습니다.</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-ui-rect border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-gray-900">{r.buyer_public_label}</p>
              <p className="text-[12px] text-gray-500">{new Date(r.created_at).toLocaleDateString("ko-KR")}</p>
            </div>
            <p className="mt-1 text-[13px] text-amber-700">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-900">{r.content}</p>
            <p className="mt-1 text-[12px] text-gray-500">
              주문 {r.order_id} · {r.visible_to_public ? "공개" : "비공개"} · {r.status}
            </p>

            <div className="mt-3 rounded-ui-rect border border-gray-200 bg-gray-50 p-2.5">
              <p className="text-[12px] font-semibold text-gray-700">사장님 댓글</p>
              <textarea
                value={drafts[r.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="고객 리뷰에 댓글을 남겨보세요."
                rows={3}
                className="mt-1 w-full rounded-ui-rect border border-gray-200 bg-white px-2 py-1.5 text-[13px] outline-none ring-signature/20 focus:ring-2"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={busyId !== null || !(drafts[r.id] ?? "").trim()}
                  onClick={() => void saveReply(r.id)}
                  className="rounded-ui-rect bg-signature px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {busyId === r.id ? "저장 중…" : "댓글 저장"}
                </button>
              </div>
              {r.owner_reply_created_at ? (
                <p className="mt-1 text-right text-[11px] text-gray-500">
                  최근 저장: {new Date(r.owner_reply_created_at).toLocaleString("ko-KR")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
