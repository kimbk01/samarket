"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAdminPosts } from "@/lib/admin-posts/getAdminPosts";
import { updatePostStatusAdmin } from "@/lib/admin-posts/updatePostAdmin";
import type { PostWithMeta } from "@/lib/posts/schema";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const STATUS_OPTIONS: { value: PostWithMeta["status"]; label: string }[] = [
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "거래완료" },
  { value: "hidden", label: "숨김" },
];

type PostsTab = "trade" | "community";

type CommunityPostRow = {
  id: string;
  user_id?: string | null;
  location_id?: string | null;
  category?: string | null;
  title?: string | null;
  status?: string | null;
  is_reported?: boolean | null;
  region_label?: string | null;
  is_sample_data?: boolean | null;
  created_at?: string | null;
};

const COMMUNITY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "게시" },
  { value: "hidden", label: "숨김" },
  { value: "deleted", label: "삭제" },
];

export function AdminPostsPageContent() {
  const [tab, setTab] = useState<PostsTab>("community");
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [communityRows, setCommunityRows] = useState<CommunityPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [communityErr, setCommunityErr] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [communityBusyId, setCommunityBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectedCommunity, setSelectedCommunity] = useState<Set<string>>(() => new Set());
  const [selectedTrade, setSelectedTrade] = useState<Set<string>>(() => new Set());
  const communitySelectAllRef = useRef<HTMLInputElement>(null);
  const tradeSelectAllRef = useRef<HTMLInputElement>(null);

  const loadTrade = useCallback(async () => {
    const list = await getAdminPosts();
    setPosts(list);
  }, []);

  const loadCommunity = useCallback(async () => {
    setCommunityErr("");
    try {
      const res = await fetch("/api/admin/community/engine/posts?limit=100", {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
      const j = (await res.json()) as { ok?: boolean; posts?: CommunityPostRow[]; error?: string };
      if (!res.ok || !j.ok) {
        setCommunityErr(j.error ?? "동네 글 목록을 불러오지 못했습니다.");
        setCommunityRows([]);
        return;
      }
      setCommunityRows(j.posts ?? []);
    } catch (e) {
      setCommunityErr((e as Error).message);
      setCommunityRows([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "trade") {
      await loadTrade();
    } else {
      await loadCommunity();
    }
    setLoading(false);
  }, [tab, loadTrade, loadCommunity]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedCommunity(new Set());
    setSelectedTrade(new Set());
    setActionMsg(null);
  }, [tab]);

  const handleStatusChange = useCallback(
    async (postId: string, status: PostWithMeta["status"]) => {
      const res = await updatePostStatusAdmin(postId, status);
      if (res.ok) void loadTrade();
    },
    [loadTrade]
  );

  const patchCommunityPost = useCallback(
    async (id: string, status: string) => {
      setCommunityBusyId(id);
      setCommunityErr("");
      try {
        const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setCommunityErr(j.error ?? "상태 변경에 실패했습니다.");
          return;
        }
        setSelectedCommunity((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        await loadCommunity();
      } finally {
        setCommunityBusyId(null);
      }
    },
    [loadCommunity]
  );

  const communityIdsVisible = communityRows.map((r) => String(r.id));
  const allCommunitySelected =
    communityIdsVisible.length > 0 && communityIdsVisible.every((id) => selectedCommunity.has(id));
  const someCommunitySelected = communityIdsVisible.some((id) => selectedCommunity.has(id));

  useEffect(() => {
    const el = communitySelectAllRef.current;
    if (el) el.indeterminate = someCommunitySelected && !allCommunitySelected;
  }, [someCommunitySelected, allCommunitySelected]);

  const tradeIdsVisible = posts.map((p) => p.id);
  const allTradeSelected =
    tradeIdsVisible.length > 0 && tradeIdsVisible.every((id) => selectedTrade.has(id));
  const someTradeSelected = tradeIdsVisible.some((id) => selectedTrade.has(id));

  useEffect(() => {
    const el = tradeSelectAllRef.current;
    if (el) el.indeterminate = someTradeSelected && !allTradeSelected;
  }, [someTradeSelected, allTradeSelected]);

  const toggleCommunityRow = useCallback((id: string, checked: boolean) => {
    setSelectedCommunity((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllCommunity = useCallback(
    (checked: boolean) => {
      setSelectedCommunity(() => {
        if (!checked) return new Set();
        return new Set(communityIdsVisible);
      });
    },
    [communityIdsVisible]
  );

  const toggleTradeRow = useCallback((id: string, checked: boolean) => {
    setSelectedTrade((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllTrade = useCallback(
    (checked: boolean) => {
      setSelectedTrade(() => {
        if (!checked) return new Set();
        return new Set(tradeIdsVisible);
      });
    },
    [tradeIdsVisible]
  );

  const bulkDeleteCommunity = useCallback(async () => {
    const ids = [...selectedCommunity];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `선택 ${ids.length}개 동네·커뮤니티 글을 DB에서 영구 삭제합니다.\n연결된 모임·댓글 등은 DB CASCADE 정책에 따라 함께 정리될 수 있습니다. 계속할까요?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setActionMsg(null);
    setCommunityErr("");
    try {
      const res = await fetch("/api/admin/community/engine/posts/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedCount?: number;
        notFoundOrSkipped?: string[];
      };
      if (!res.ok || !j.ok) {
        setCommunityErr(j.error ?? "일괄 삭제에 실패했습니다.");
        return;
      }
      setSelectedCommunity(new Set());
      setActionMsg(
        `DB에서 ${j.deletedCount ?? 0}건 삭제했습니다.${
          j.notFoundOrSkipped?.length
            ? ` (없음·건너뜀 ${j.notFoundOrSkipped.length}건)`
            : ""
        }`
      );
      await loadCommunity();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedCommunity, loadCommunity]);

  const bulkDeleteTrade = useCallback(async () => {
    const ids = [...selectedTrade];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `선택 ${ids.length}개 거래 글을 DB에서 영구 삭제합니다.\n찜·채팅 등 연관 데이터는 DB 제약에 따라 함께 삭제되거나 남을 수 있습니다. 계속할까요?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/posts/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedCount?: number;
        notFoundOrSkipped?: string[];
      };
      if (!res.ok || !j.ok) {
        setActionMsg(j.error ?? "거래 글 일괄 삭제에 실패했습니다.");
        return;
      }
      setSelectedTrade(new Set());
      setActionMsg(
        `거래 posts DB에서 ${j.deletedCount ?? 0}건 삭제했습니다.${
          j.notFoundOrSkipped?.length
            ? ` (없음·건너뜀 ${j.notFoundOrSkipped.length}건)`
            : ""
        }`
      );
      await loadTrade();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedTrade, loadTrade]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="커뮤니티 게시글" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border pb-2">
        <button
          type="button"
          onClick={() => setTab("community")}
          className={`rounded-ui-rect px-3 py-2 text-[14px] font-medium ${
            tab === "community"
              ? "bg-signature text-white"
              : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
          }`}
        >
          동네·커뮤니티
        </button>
        <button
          type="button"
          onClick={() => setTab("trade")}
          className={`rounded-ui-rect px-3 py-2 text-[14px] font-medium ${
            tab === "trade"
              ? "bg-signature text-white"
              : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
          }`}
        >
          거래 글 (posts)
        </button>
      </div>

      {actionMsg ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          {actionMsg}
        </div>
      ) : null}

      {tab === "community" ? (
        <p className="text-[13px] text-sam-muted">
          <code className="rounded bg-sam-surface-muted px-1">community_posts</code> 기준 목록입니다. 앱{" "}
          <Link href="/philife" className="text-signature hover:underline">
            /philife
          </Link>
          는 같은 테이블을 쓰며, 상단 주제 탭(전체·모임·주제별)에 맞게 피드가 나뉩니다. 동네(지역) 고정 UI는 추후
          적용 예정이며, 그때 사용자 동네와 목록이 더 일치합니다. 게시 상태 <strong>삭제</strong>는 소프트 삭제이고,{" "}
          <strong>선택 후 DB 삭제</strong>는 행을 영구 제거합니다.
        </p>
      ) : (
        <p className="text-[13px] text-sam-muted">
          <strong className="font-semibold text-sam-fg">거래 마켓 글</strong>은{" "}
          <code className="rounded bg-sam-surface-muted px-1">posts</code> 테이블이며 필라이프 피드와{" "}
          <strong className="font-semibold text-sam-fg">별도</strong>입니다. 커뮤니티 글은 위의「동네·커뮤니티」탭을
          이용해 주세요.
        </p>
      )}

      {tab === "community" && !loading && communityRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <span className="text-[13px] text-sam-fg">
            선택 <strong>{selectedCommunity.size}</strong>개
          </span>
          <button
            type="button"
            disabled={bulkBusy || selectedCommunity.size === 0}
            onClick={() => void bulkDeleteCommunity()}
            className="rounded-ui-rect bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            선택 항목 DB에서 영구 삭제
          </button>
        </div>
      ) : null}

      {tab === "trade" && !loading && posts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <span className="text-[13px] text-sam-fg">
            선택 <strong>{selectedTrade.size}</strong>개
          </span>
          <button
            type="button"
            disabled={bulkBusy || selectedTrade.size === 0}
            onClick={() => void bulkDeleteTrade()}
            className="rounded-ui-rect bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            선택 항목 DB에서 영구 삭제
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-[14px] text-sam-muted">불러오는 중…</div>
      ) : tab === "trade" ? (
        posts.length === 0 ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
            게시글이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app">
                  <th className="w-10 px-2 py-2 text-center font-medium text-sam-fg">
                    <input
                      ref={tradeSelectAllRef}
                      type="checkbox"
                      checked={allTradeSelected}
                      onChange={(e) => toggleAllTrade(e.target.checked)}
                      className="rounded border-sam-border"
                      title="현재 목록 전체 선택"
                      aria-label="거래 글 전체 선택"
                    />
                  </th>
                  <th className="p-3 font-medium text-sam-fg">제목</th>
                  <th className="p-3 font-medium text-sam-fg">타입</th>
                  <th className="p-3 font-medium text-sam-fg">상태</th>
                  <th className="p-3 font-medium text-sam-fg">등록일</th>
                  <th className="p-3 font-medium text-sam-fg">관리</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-sam-border-soft">
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTrade.has(p.id)}
                        onChange={(e) => toggleTradeRow(p.id, e.target.checked)}
                        className="rounded border-sam-border"
                        aria-label={`선택 ${p.title.slice(0, 20)}`}
                      />
                    </td>
                    <td className="p-3">
                      <Link href={`/post/${p.id}`} className="text-signature hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="p-3 text-sam-muted">{p.type}</td>
                    <td className="p-3">
                      <select
                        value={p.status}
                        onChange={(e) =>
                          handleStatusChange(p.id, e.target.value as PostWithMeta["status"])
                        }
                        className="rounded border border-sam-border px-2 py-1 text-[13px]"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-sam-muted">{formatTimeAgo(p.created_at)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(p.id, "hidden")}
                        className="text-[13px] text-red-600 hover:underline"
                      >
                        숨김
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          {communityErr ? (
            <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
              {communityErr}
            </div>
          ) : null}
          {communityRows.length === 0 && !communityErr ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
              동네·커뮤니티 글이 없습니다.
            </div>
          ) : communityRows.length > 0 ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[760px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    <th className="w-10 px-2 py-2 text-center font-medium text-sam-fg">
                      <input
                        ref={communitySelectAllRef}
                        type="checkbox"
                        checked={allCommunitySelected}
                        onChange={(e) => toggleAllCommunity(e.target.checked)}
                        className="rounded border-sam-border"
                        title="현재 목록 전체 선택"
                        aria-label="동네 글 전체 선택"
                      />
                    </th>
                    <th className="p-3 font-medium text-sam-fg">제목</th>
                    <th className="p-3 font-medium text-sam-fg">주제</th>
                    <th className="p-3 font-medium text-sam-fg">동네</th>
                    <th className="p-3 font-medium text-sam-fg">상태</th>
                    <th className="p-3 font-medium text-sam-fg">신고</th>
                    <th className="p-3 font-medium text-sam-fg">등록</th>
                    <th className="p-3 font-medium text-sam-fg">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {communityRows.map((r) => {
                    const id = String(r.id ?? "");
                    const busy = communityBusyId === id;
                    return (
                      <tr key={id} className="border-b border-sam-border-soft">
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCommunity.has(id)}
                            onChange={(e) => toggleCommunityRow(id, e.target.checked)}
                            disabled={bulkBusy}
                            className="rounded border-sam-border"
                            aria-label={`선택 ${String(r.title ?? "").slice(0, 24)}`}
                          />
                        </td>
                        <td className="max-w-[220px] p-3">
                          <Link
                            href={`/philife/${encodeURIComponent(id)}`}
                            className="font-medium text-signature hover:underline"
                          >
                            {String(r.title ?? "(제목 없음)")}
                          </Link>
                          {r.is_sample_data === true ? (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-900">
                              샘플
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-sam-muted">{String(r.category ?? "—")}</td>
                        <td
                          className="max-w-[140px] truncate p-3 text-sam-muted"
                          title={String(r.region_label ?? "")}
                        >
                          {String(r.region_label ?? "—")}
                        </td>
                        <td className="p-3">
                          <select
                            value={String(r.status ?? "active")}
                            disabled={busy || bulkBusy}
                            onChange={(e) => void patchCommunityPost(id, e.target.value)}
                            className="max-w-[7rem] rounded border border-sam-border px-2 py-1 text-[13px]"
                          >
                            {COMMUNITY_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center text-[13px]">
                          {r.is_reported === true ? (
                            <span className="rounded bg-amber-100 px-1.5 text-amber-900">Y</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3 text-sam-muted">
                          {r.created_at ? formatTimeAgo(r.created_at) : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() => void patchCommunityPost(id, "hidden")}
                              className="text-[12px] text-amber-700 hover:underline"
                            >
                              숨김
                            </button>
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() => void patchCommunityPost(id, "deleted")}
                              className="text-[12px] text-red-600 hover:underline"
                            >
                              삭제
                            </button>
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() => void patchCommunityPost(id, "active")}
                              className="text-[12px] text-emerald-700 hover:underline"
                            >
                              복구
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
