"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type ShellState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "no_store" }
  | { kind: "error"; message: string }
  | { kind: "ok"; storeId: string };

export function StoreOwnerOrderChatsShell({ slug }: { slug: string }) {
  const [state, setState] = useState<ShellState>({ kind: "loading" });

  const loadStore = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setState({ kind: "loading" });
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const j = raw as { ok?: boolean; stores?: { id: string; slug: string }[] };
      if (status === 401) {
        setState({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        if (!silent) setState({ kind: "error", message: "서버 설정을 확인해 주세요." });
        return;
      }
      if (!j?.ok || !Array.isArray(j.stores)) {
        if (!silent) setState({ kind: "error", message: "목록을 불러오지 못했습니다." });
        return;
      }
      const hit = j.stores.find((s) => s.slug === slug);
      if (!hit) {
        setState({ kind: "no_store" });
        return;
      }
      setState({
        kind: "ok",
        storeId: hit.id,
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "네트워크 오류" });
    }
  }, [slug]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  useRefetchOnPageShowRestore(() => {
    void loadStore({ silent: true });
  });

  const ordersHref = "/stores/owner/orders";
  const loginHref = "/login";

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10 text-center text-sm text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (state.kind === "unauth") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10 text-center text-sm text-sam-muted">
        로그인 후 주문 채팅과 주문 현황을 바로 확인할 수 있습니다.
        <Link href={loginHref} className="mt-4 inline-flex rounded-ui-rect bg-violet-700 px-4 py-2 font-semibold text-white">
          로그인하고 주문 보기
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10 text-center text-sm text-red-600">
        {state.message}
        <button type="button" onClick={() => void loadStore({ silent: false })} className="mt-4 block w-full text-violet-700 underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (state.kind === "no_store") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10 text-center text-sm text-sam-muted">
        이 주소의 매장을 찾을 수 없거나 권한이 없습니다.
        <Link href="/stores/owner/orders" className="mt-4 block text-violet-700 underline">
          사업자 주문함
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sam-app pb-10">
      <header className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface px-2 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <AppBackButton backHref={ordersHref} />
          <h1 className="min-w-0 flex-1 truncate text-center sam-text-body-lg font-bold text-sam-fg">
            주문 채팅
          </h1>
          <span className="w-10" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-3 px-3 pt-4">
        <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm ring-1 ring-sam-border-soft">
          <p>주문 채팅은 메신저 배달 채팅함으로 통합되었습니다.</p>
          <Link href="/community-messenger/delivery-chats" className="mt-3 inline-block font-medium text-signature underline">
            배달 채팅함 열기
          </Link>
        </div>
        <Link href={ordersHref} className="inline-block text-sm text-violet-700 underline">
          주문 관리로
        </Link>
      </div>
    </div>
  );
}
