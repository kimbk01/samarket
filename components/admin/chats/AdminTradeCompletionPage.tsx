"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

interface Row {
  roomId: string;
  postId: string;
  postTitle: string;
  sellerId: string;
  buyerId: string;
  tradeFlowStatus: string;
  sellerCompletedAt: string | null;
  buyerConfirmedAt: string | null;
  buyerConfirmSource: string | null;
  buyerPending: boolean;
  lastMessageAt: string | null;
}

export function AdminTradeCompletionPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = getCurrentUser();
    const uid = user?.id?.trim() ?? "";
    if (!uid || !isAdminUser(user)) {
      setError("관리자 로그인이 필요합니다.");
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "조회 실패");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("네트워크 오류");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmBuyer = async (roomId: string) => {
    const user = getCurrentUser();
    const uid = user?.id?.trim() ?? "";
    if (!uid) return;
    if (!window.confirm("이 방에 대해 구매자 거래완료 확인(관리자완료)을 반영할까요?")) return;
    setBusyId(roomId);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade-flow/confirm-buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError((data as { error?: string }).error ?? "처리 실패");
        return;
      }
      await load();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="거래완료 (판매자 처리)" />
      <p className="text-[13px] text-gray-600">
        판매자가 거래완료 처리한 채팅만 모았습니다.{" "}
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">구매자 미반영</span> 행은 구매자가 아직
        거래완료 확인을 하지 않은 경우입니다. 필요 시 관리자 확인으로 진행할 수 있습니다.
      </p>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-[14px] text-gray-500">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-600">
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">채팅</th>
                <th className="px-3 py-2 font-medium">글</th>
                <th className="px-3 py-2 font-medium">흐름</th>
                <th className="px-3 py-2 font-medium">판매자완료 시각</th>
                <th className="px-3 py-2 font-medium">구매자 확인</th>
                <th className="px-3 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.roomId}
                  className={`border-b border-gray-50 ${
                    r.buyerPending ? "bg-amber-50/90 hover:bg-amber-50" : "hover:bg-gray-50/80"
                  }`}
                >
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
                        구매자 미반영
                      </span>
                    ) : (
                      <span className="text-gray-500">처리됨</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">
                    <Link href={`/chats/${r.roomId}`} className="text-signature hover:underline" target="_blank">
                      {r.roomId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.postTitle}>
                    {r.postTitle}
                  </td>
                  <td className="px-3 py-2">{r.tradeFlowStatus}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.sellerCompletedAt ? new Date(r.sellerCompletedAt).toLocaleString("ko-KR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {r.buyerConfirmedAt
                      ? `${new Date(r.buyerConfirmedAt).toLocaleString("ko-KR")} (${r.buyerConfirmSource ?? "—"})`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.buyerPending ? (
                      <button
                        type="button"
                        disabled={busyId === r.roomId}
                        onClick={() => void confirmBuyer(r.roomId)}
                        className="rounded border border-gray-300 bg-signature/5 px-2 py-1 text-[11px] font-medium text-gray-900 hover:bg-signature/10 disabled:opacity-50"
                      >
                        {busyId === r.roomId ? "처리 중…" : "관리자 확인"}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-[14px] text-gray-500">판매자 완료 건이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
