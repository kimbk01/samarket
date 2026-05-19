"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useStoreOrderRoomSnapshot,
  type StoreOrderRoomSnapshot,
} from "@/lib/store-order-chat/use-store-order-room-snapshot";

type StoreOrderDeliveryRoomContextValue = {
  storeOrderId: string;
  storeId: string;
  snapshot: StoreOrderRoomSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  detailDrawerOpen: boolean;
  setDetailDrawerOpen: (open: boolean) => void;
  toggleDetailDrawer: () => void;
};

const StoreOrderDeliveryRoomContext = createContext<StoreOrderDeliveryRoomContextValue | null>(
  null
);

type ProviderProps = {
  children: ReactNode;
  storeOrderId: string;
  storeId: string;
  /** 매장 API 우선(오너) — `useStoreOrderRoomSnapshot` 과 동일 */
  isOwnerApi: boolean;
  enabled: boolean;
};

/**
 * 배달 주문 메신저 방 — 주문 스냅샷 단일 fetch + 우측 상세 drawer 상태.
 * 헤더·composer chrome·패널이 공유해 이중 API·열림 상태 잔류를 막는다.
 */
export function StoreOrderDeliveryRoomProvider({
  children,
  storeOrderId,
  storeId,
  isOwnerApi,
  enabled,
}: ProviderProps) {
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const { snapshot, loading, error, refresh } = useStoreOrderRoomSnapshot({
    storeOrderId,
    storeId,
    isOwner: isOwnerApi,
    enabled,
  });

  useEffect(() => {
    setDetailDrawerOpen(false);
  }, [storeOrderId]);

  const toggleDetailDrawer = useCallback(() => {
    setDetailDrawerOpen((prev) => !prev);
  }, []);

  const value = useMemo(
    (): StoreOrderDeliveryRoomContextValue => ({
      storeOrderId,
      storeId,
      snapshot,
      loading,
      error,
      refresh,
      detailDrawerOpen,
      setDetailDrawerOpen,
      toggleDetailDrawer,
    }),
    [
      storeOrderId,
      storeId,
      snapshot,
      loading,
      error,
      refresh,
      detailDrawerOpen,
      toggleDetailDrawer,
    ]
  );

  return (
    <StoreOrderDeliveryRoomContext.Provider value={value}>
      {children}
    </StoreOrderDeliveryRoomContext.Provider>
  );
}

export function useStoreOrderDeliveryRoom(): StoreOrderDeliveryRoomContextValue {
  const ctx = useContext(StoreOrderDeliveryRoomContext);
  if (!ctx) {
    throw new Error("useStoreOrderDeliveryRoom: StoreOrderDeliveryRoomProvider 가 없습니다.");
  }
  return ctx;
}

export function useStoreOrderDeliveryRoomOptional(): StoreOrderDeliveryRoomContextValue | null {
  return useContext(StoreOrderDeliveryRoomContext);
}

/** @deprecated `useStoreOrderDeliveryRoom` 의 `detailDrawerOpen` / `setDetailDrawerOpen` 사용 */
export function useStoreOrderDeliveryDetailDrawer() {
  const room = useStoreOrderDeliveryRoom();
  return useMemo(
    () => ({
      open: room.detailDrawerOpen,
      setOpen: room.setDetailDrawerOpen,
      toggle: room.toggleDetailDrawer,
    }),
    [room.detailDrawerOpen, room.setDetailDrawerOpen, room.toggleDetailDrawer]
  );
}

export function useStoreOrderDeliveryDetailDrawerOptional() {
  const room = useStoreOrderDeliveryRoomOptional();
  if (!room) return null;
  return {
    open: room.detailDrawerOpen,
    setOpen: room.setDetailDrawerOpen,
    toggle: room.toggleDetailDrawer,
  };
}

/** @deprecated `StoreOrderDeliveryRoomProvider` 사용 */
export const StoreOrderDeliveryDetailDrawerProvider = StoreOrderDeliveryRoomProvider;
