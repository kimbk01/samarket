"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { listOrderChatRoomsForOwner } from "@/lib/shared-order-chat/shared-chat-store";

type ShellState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "no_store" }
  | { kind: "error"; message: string }
  | { kind: "ok"; storeId: string; ownerUserId: string };

export function StoreOwnerOrderChatsShell({ slug }: { slug: string }) {
  const cv = useOrderChatVersion();
  const [state, setState] = useState<ShellState>({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/stores", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (res.status === 503) {
        if (!silent) setState({ kind: "error", message: "서버 설정을 확인해 주세요." });
        return;
      }
      const j = await res.json();
      if (!j?.ok || !Array.isArray(j.stores)) {
        if (!silent) setState({ kind: "error", message: "목록을 불러오지 못했습니다." });
        return;
      }
      const hit = (j.stores as { id: string; owner_user_id: string; slug: string }[]).find(
        (s) => s.slug === slug
      );
      if (!hit) {
        setState({ kind: "no_store" });
        return;
      }
      setState({
        kind: "ok",
        storeId: hit.id,
        ownerUserId: hit.owner_user_id,
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "네트워크 오류" });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const rows = useMemo(() => {
    if (state.kind !== "ok") return [];
    void cv;
    return listOrderChatRoomsForOwner(state.ownerUserId, state.storeId);
  }, [state, cv]);

  const ordersHref = "/my/business/store-orders";
  const orderChatsHref = "/my/store-orders";
  const loginHref = `/login?next=${encodeURIComponent(ordersHref)}`;

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-10 text-center text-sm text-gray-500">
        불러오는 중…
      </div>
    );
  }

  if (state.kind === "unauth") {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-10 text-center text-sm text-gray-600">
        로그인 후 주문 채팅과 주문 현황을 바로 확인할 수 있습니다.
        <Link href={loginHref} className="mt-4 inline-flex rounded-ui-rect bg-violet-700 px-4 py-2 font-semibold text-white">
          로그인하고 주문 보기
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-10 text-center text-sm text-red-600">
        {state.message}
        <button type="button" onClick={() => void load({ silent: false })} className="mt-4 block w-full text-violet-700 underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (state.kind === "no_store") {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-10 text-center text-sm text-gray-600">
        이 주소의 매장을 찾을 수 없거나 권한이 없습니다.
        <Link href="/my/business/store-orders" className="mt-4 block text-violet-700 underline">
          사업자 주문함
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-10">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-2 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <AppBackButton backHref={ordersHref} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-gray-900">
            주문 채팅
          </h1>
          <span className="w-10" />
        </div>
      </header>
      <ChatHubTopTabs active="order" orderChatsHref={orderChatsHref} />
      <div className="mx-auto max-w-3xl space-y-3 px-3 pt-4">
        {rows.length === 0 ? (
          <p className="rounded-ui-rect bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-gray-100">
            열린 주문 채팅이 없어요. 고객이 주문·채팅을 시작하면 여기에 표시됩니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/my/business/store-order-chat/${encodeURIComponent(r.order_id)}`}
                  className="flex items-start justify-between gap-2 rounded-ui-rect border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{r.buyer_name}</p>
                    <p className="font-mono text-xs text-gray-400">{r.order_no}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{r.last_message}</p>
                  </div>
                  <UnreadBadge count={r.unread_count_owner} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href={ordersHref} className="inline-block text-sm text-violet-700 underline">
          주문 관리로
        </Link>
      </div>
    </div>
  );
}
