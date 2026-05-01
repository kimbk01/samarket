"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import {
  TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY,
  TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY,
} from "@/lib/navigation/trade-meet-spot-return-to";
import {
  TRADE_WRITE_EXIT_SHEET_BODY,
  TRADE_WRITE_EXIT_SHEET_TITLE,
} from "@/lib/posts/trade-write-exit-cleanup";

type TradeWriteSheetContextValue = {
  isOpen: boolean;
  openEpoch: number;
  /**
   * 시트가 열릴 때 `TradeWriteBottomSheet` 의 카테고리 키 초기값.
   * 빈 문자열 = (+) 등 신규 진입. 비어 있지 않으면 희망 장소 지도 복귀 등 **이어 쓰기** 복원용.
   */
  initialCategory: string;
  /** 폼 입력 등으로 이탈 시 확인이 필요한지 — `WriteSheetFlowInner` 가 갱신 */
  blockingDraft: boolean;
  setBlockingDraft: (v: boolean) => void;
  /**
   * TradeWriteForm / JobsWriteForm / ExchangeWriteForm 이 등록.
   * 나가기·외부 이탈 확인 직전에 호출해 카테고리별 세션 스냅샷을 남김(일반 거래 세션 초안 · 일·환전 스테이징).
   */
  persistSnapshotBeforeLeaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
  /** 다른 메뉴·탭 이동 전 — 초안 있으면 확인 후 시트 닫기. `nextHref` 있으면 확인 후 `router.push` */
  attemptLeaveForExternalNavigation: (nextHref?: string | null) => boolean;
  open: (_category?: string) => void;
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
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");
  const [blockingDraft, setBlockingDraft] = useState(false);
  const [externalLeaveOpen, setExternalLeaveOpen] = useState(false);
  const pendingNavHrefRef = useRef<string | null>(null);
  const persistSnapshotBeforeLeaveRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * `(+)`·플로팅 등 **신규** 는 `open("")` — 카테고리 미선택.
   * 거래 희망 장소 확인 후 복귀는 세션에 넣어 둔 키로 `open(categoryId)` 해 폼을 이어 간다.
   */
  const open = useCallback((category?: string) => {
    setInitialCategory((category ?? "").trim());
    setOpenEpoch((e) => e + 1);
    setBlockingDraft(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setBlockingDraft(false);
    setIsOpen(false);
  }, []);

  const attemptLeaveForExternalNavigation = useCallback(
    (nextHref?: string | null) => {
      if (!isOpen) return true;
      if (!blockingDraft) {
        close();
        return true;
      }
      pendingNavHrefRef.current = nextHref?.trim() ? nextHref.trim() : null;
      setExternalLeaveOpen(true);
      return false;
    },
    [isOpen, blockingDraft, close]
  );

  const handleExternalLeaveCancel = useCallback(() => {
    setExternalLeaveOpen(false);
    pendingNavHrefRef.current = null;
  }, []);

  const handleExternalLeaveConfirm = useCallback(() => {
    void (async () => {
      try {
        await persistSnapshotBeforeLeaveRef.current?.();
      } catch {
        /* 스냅샷 실패해도 이탈 진행 */
      }
      close();
      setExternalLeaveOpen(false);
      const href = pendingNavHrefRef.current;
      pendingNavHrefRef.current = null;
      if (href) router.push(href);
    })();
  }, [close, router]);

  /** 거래 희망 장소 지도에서 돌아온 뒤 같은 마켓 카테고리 URL이면 글쓰기 시트 자동 오픈(페인트 전) */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const base = pathname.split("?")[0] ?? "";
    let flag: string | null = null;
    let cat: string | null = null;
    try {
      flag = sessionStorage.getItem(TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY);
      cat = sessionStorage.getItem(TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY);
    } catch {
      return;
    }
    if (flag !== "1" || !cat?.trim()) return;
    const key = cat.trim();
    const expected = `/market/${key}`;
    if (base !== expected) return;
    try {
      sessionStorage.removeItem(TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY);
      sessionStorage.removeItem(TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY);
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
      persistSnapshotBeforeLeaveRef,
      attemptLeaveForExternalNavigation,
      open,
      close,
    }),
    [isOpen, openEpoch, initialCategory, blockingDraft, attemptLeaveForExternalNavigation, open, close]
  );

  return (
    <TradeWriteSheetContext.Provider value={value}>
      {children}
      <MobileConfirmBottomSheet
        open={externalLeaveOpen}
        onCancel={handleExternalLeaveCancel}
        title={TRADE_WRITE_EXIT_SHEET_TITLE}
        description={TRADE_WRITE_EXIT_SHEET_BODY}
        cancelLabel="계속 작성"
        confirmLabel="나가기"
        confirmTone="primary"
        onConfirm={handleExternalLeaveConfirm}
        zIndexClass="z-[70]"
        ariaLabel="작성 중 이탈 확인"
        interactionMode="blocking"
      />
    </TradeWriteSheetContext.Provider>
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
