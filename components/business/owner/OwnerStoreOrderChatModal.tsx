"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

const BOTTOM_OVER_NAV =
  "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]" as const;

/** `bottom` 클래스(4rem+safe) + 여백을 반영해, 아래쪽 카드여도 채팅 영역 최소 높이 확보 */
function computeModalTopPx(anchorTopPx: number): number {
  if (typeof window === "undefined") {
    return Number.isFinite(anchorTopPx) ? Math.max(56, Math.floor(anchorTopPx)) : 120;
  }
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const navReserve = 64;
  const safeGuess = 20;
  const gap = 8;
  const bottomReserve = navReserve + safeGuess + gap;
  const minChatPx = Math.min(400, Math.max(260, Math.round(vh * 0.42)));
  const maxTop = Math.max(56, Math.round(vh - bottomReserve - minChatPx));
  const raw = Number.isFinite(anchorTopPx) ? Math.max(56, Math.floor(anchorTopPx)) : 120;
  return Math.min(raw, maxTop);
}

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  orderId: string;
  /** 뷰포트 기준 `getBoundingClientRect().bottom` — 상품준비(회색) 박스 하단 */
  anchorTopPx: number;
};

export function OwnerStoreOrderChatModal({ open, onClose, storeId, orderId, anchorTopPx }: Props) {
  const [mounted, setMounted] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [layoutTopPx, setLayoutTopPx] = useState(() => computeModalTopPx(anchorTopPx));

  const loadRoom = useCallback(async () => {
    const sid = storeId.trim();
    const oid = orderId.trim();
    if (!sid || !oid) {
      setErr("missing_ids");
      return;
    }
    setLoading(true);
    setErr(null);
    setRoomId(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(sid)}/orders/${encodeURIComponent(oid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        meta?: { chat_room_id?: string | null };
        error?: string;
      };
      if (!res.ok || j?.ok !== true) {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        return;
      }
      const rid = typeof j.meta?.chat_room_id === "string" ? j.meta.chat_room_id.trim() : "";
      if (!rid) {
        setErr("no_chat_room");
        return;
      }
      setRoomId(rid);
    } catch {
      setErr("network");
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setRoomId(null);
      setErr(null);
      setLoading(false);
      return;
    }
    void loadRoom();
  }, [open, loadRoom]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const apply = () => setLayoutTopPx(computeModalTopPx(anchorTopPx));
    apply();
    window.addEventListener("resize", apply);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
    };
  }, [open, anchorTopPx]);

  if (!mounted || !open) return null;

  const listHref = buildStoreOrdersHref({ storeId, orderId });

  return createPortal(
    <div className="fixed inset-0 z-[190]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/45"
        aria-label="채팅 닫기"
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 z-10 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl ${BOTTOM_OVER_NAV}`}
        style={{ top: layoutTopPx }}
        role="dialog"
        aria-modal="true"
        aria-label="주문 채팅"
      >
        {loading ? (
          <div className="flex min-h-[10rem] flex-1 items-center justify-center text-sm text-gray-500">
            채팅을 여는 중…
          </div>
        ) : err ? (
          <div className="flex min-h-[10rem] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-gray-700">
              {err === "no_chat_room"
                ? "채팅방을 열 수 없습니다."
                : err === "network"
                  ? "네트워크 오류가 발생했습니다."
                  : "채팅을 불러오지 못했습니다."}
            </p>
            <button
              type="button"
              className="text-sm font-medium text-signature underline"
              onClick={() => void loadRoom()}
            >
              다시 시도
            </button>
            <button type="button" className="text-sm text-gray-600 underline" onClick={onClose}>
              닫기
            </button>
          </div>
        ) : roomId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatRoomScreen
              roomId={roomId}
              listHref={listHref}
              onListNavigate={onClose}
              embedded
              embeddedFill
              ownerStoreOrderModalChrome
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
