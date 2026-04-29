"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

type TradeWriteSheetContextValue = {
  isOpen: boolean;
  openEpoch: number;
  /** `/write?category=` 와 동일 — 빈 문자열이면 카테고리 미선택 */
  initialCategory: string;
  /** 폼 입력 등으로 이탈 시 확인이 필요한지 — `WriteSheetFlowInner` 가 갱신 */
  blockingDraft: boolean;
  setBlockingDraft: (v: boolean) => void;
  /** 다른 메뉴·탭 이동 전 — 초안 있으면 확인 후 시트 닫기. `true`면 네비게이션 진행 */
  attemptLeaveForExternalNavigation: () => boolean;
  open: (category: string) => void;
  close: () => void;
};

const TradeWriteSheetContext = createContext<TradeWriteSheetContextValue | null>(null);

function isTradeWriteSheetSurfacePath(p: string): boolean {
  if (p === "/philife") return true;
  if (p === "/market") return true;
  /** 거래 희망 장소 풀페이지 — 시트를 닫아 지도가 보이게 함 (`/market/` 이면 모두 표면으로 두면 안 됨) */
  if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return false;
  if (p.startsWith("/market/")) return true;
  return false;
}

export function TradeWriteSheetProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");
  const [blockingDraft, setBlockingDraft] = useState(false);

  const open = useCallback((category: string) => {
    setInitialCategory((category ?? "").trim());
    setOpenEpoch((e) => e + 1);
    setBlockingDraft(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setBlockingDraft(false);
    setIsOpen(false);
  }, []);

  const attemptLeaveForExternalNavigation = useCallback((): boolean => {
    if (!isOpen) return true;
    if (!blockingDraft) {
      close();
      return true;
    }
    const ok = window.confirm(
      "작성 중인 글이 있습니다. 이동하면 저장되지 않습니다. 계속할까요?"
    );
    if (!ok) return false;
    close();
    return true;
  }, [isOpen, blockingDraft, close]);

  const reopenFlag = "samarket:tradeWriteReopenAfterMeetSpot:v1";
  const reopenCatKey = "samarket:tradeMeetSpotReturnCategoryKey:v1";

  /** 거래 희망 장소 지도에서 돌아온 뒤 같은 마켓 카테고리 URL이면 글쓰기 시트 자동 오픈(페인트 전) */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const base = pathname.split("?")[0] ?? "";
    let flag: string | null = null;
    let cat: string | null = null;
    try {
      flag = sessionStorage.getItem(reopenFlag);
      cat = sessionStorage.getItem(reopenCatKey);
    } catch {
      return;
    }
    if (flag !== "1" || !cat?.trim()) return;
    const key = cat.trim();
    const expected = `/market/${key}`;
    if (base !== expected) return;
    try {
      sessionStorage.removeItem(reopenFlag);
      sessionStorage.removeItem(reopenCatKey);
    } catch {
      /* ignore */
    }
    open(key);
  }, [pathname, open]);

  useEffect(() => {
    if (!isOpen) return;
    const p = pathname.split("?")[0] ?? "";
    if (isTradeWriteSheetSurfacePath(p)) return;
    close();
  }, [isOpen, pathname, close]);

  const value = useMemo(
    () => ({
      isOpen,
      openEpoch,
      initialCategory,
      blockingDraft,
      setBlockingDraft,
      attemptLeaveForExternalNavigation,
      open,
      close,
    }),
    [isOpen, openEpoch, initialCategory, blockingDraft, attemptLeaveForExternalNavigation, open, close]
  );

  return (
    <TradeWriteSheetContext.Provider value={value}>{children}</TradeWriteSheetContext.Provider>
  );
}

export function useTradeWriteSheet() {
  const v = useContext(TradeWriteSheetContext);
  if (!v) {
    throw new Error("useTradeWriteSheet must be used within TradeWriteSheetProvider");
  }
  return v;
}

export function useTradeWriteSheetOptional(): TradeWriteSheetContextValue | null {
  return useContext(TradeWriteSheetContext);
}
