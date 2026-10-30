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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY,
  TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY,
} from "@/lib/navigation/trade-meet-spot-return-to";
import { consumeMemberAddressTradeWritePendingRestore } from "@/lib/addresses/member-address-caller-context";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { getAppEntryDecision } from "@/lib/lifecycle/app-entry-kind";
import { markTradeWriteSkipPersistedDraftPromptAfterMeetSpot } from "@/lib/navigation/trade-meet-spot-return-to";
import {
  clearTradeWriteSheetOpenMarker,
  decideTradeWriteSheetGateReturn,
  decideTradeWriteSheetReopen,
  documentCameFromTradeWriteGate,
  isTradeWriteGatePath,
  readDocumentStartedAtMs,
  markTradeWriteSheetGateDeparture,
  readTradeWriteSheetOpenMarker,
  type TradeWriteSheetOpenMarkerV1,
} from "@/lib/posts/trade-write-sheet-open-marker";

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
   * `TradeCategoryWriteForm` 경유 폼이 등록(`TradeWriteForm` · 일자리 · 환전 등).
   * 나가기·외부 이탈 확인 직전에 호출해 카테고리별 세션 스냅샷을 남김(일반 거래 세션 초안 · 일·환전 스테이징).
   */
  persistSnapshotBeforeLeaveRef: React.MutableRefObject<(() => Promise<void>) | null>;
  /** 다른 메뉴·탭 이동 전 — 초안 있으면 확인 후 시트 닫기. `nextHref` 있으면 확인 후 `router.push` */
  attemptLeaveForExternalNavigation: (nextHref?: string | null) => boolean;
  open: (_category?: string) => void;
  close: () => void;
};

const TradeWriteSheetContext = createContext<TradeWriteSheetContextValue | null>(null);

export function isTradeWriteSheetSurfacePath(p: string): boolean {
  if (p === "/philife") return true;
  if (p === "/market") return true;
  /** 내 매물 「판매하기」 — 이 화면 위에서 시트를 연다 (없으면 열자마자 닫힘) */
  if (p === "/mypage/products") return true;
  /** 거래 희망 장소 풀페이지 — 시트를 닫아 지도가 보이게 함 (`/market/` 이면 모두 표면으로 두면 안 됨) */
  if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return false;
  if (p.startsWith("/market/")) return true;
  return false;
}

export function TradeWriteSheetProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");
  const [blockingDraft, setBlockingDraft] = useState(false);
  const [externalLeaveOpen, setExternalLeaveOpen] = useState(false);
  const pendingNavHrefRef = useRef<string | null>(null);
  const persistSnapshotBeforeLeaveRef = useRef<(() => Promise<void>) | null>(null);
  /** 이 문서에서 시트가 한 번이라도 열렸는지 — 앱 재시작 복원이 다른 열기와 겹치지 않게 */
  const openedInDocumentRef = useRef(false);
  /** `open()` 호출 횟수 — 인증·보완 복귀 때 다른 경로(주소 복귀 등)가 이미 열었는지 비교 */
  const openCountRef = useRef(0);
  /** D5 — 이 문서 안에서 인증·보완 화면으로 나갔을 때의 `open()` 횟수 (null = 이 문서에서 나간 적 없음) */
  const gateDepartureOpenCountRef = useRef<number | null>(null);
  /** 앱 재시작 복원 — 문서당 1회. pending = 복원 경로 도착 대기 */
  const sheetRestoreRef = useRef<
    { state: "pending"; marker: TradeWriteSheetOpenMarkerV1; bootPath: string } | { state: "done" } | null
  >(null);

  /**
   * `(+)`·플로팅 등 **신규** 는 `open("")` — 카테고리 미선택.
   * 거래 희망 장소 확인 후 복귀는 세션에 넣어 둔 키로 `open(categoryId)` 해 폼을 이어 간다.
   */
  const open = useCallback((category?: string) => {
    openedInDocumentRef.current = true;
    openCountRef.current += 1;
    setInitialCategory((category ?? "").trim());
    setOpenEpoch((e) => e + 1);
    setBlockingDraft(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    clearTradeWriteSheetOpenMarker();
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

  /** 주소 확인 → CallerContext pending_restore (meet-spot flags는 fallback). */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const fromAddress = consumeMemberAddressTradeWritePendingRestore(pathname);
    if (fromAddress?.categoryKey) {
      open(fromAddress.categoryKey);
      return;
    }
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
    const pathOnly = (pathname.split("?")[0] ?? "").trim().replace(/\/+$/, "") || "";
    let categoryFromQuery = "";
    try {
      categoryFromQuery = new URLSearchParams(window.location.search).get("category")?.trim() ?? "";
    } catch {
      categoryFromQuery = "";
    }
    const legacyMatch = pathOnly.match(/^\/market\/([^/]+)$/);
    let legacySeg = "";
    if (legacyMatch?.[1]) {
      try {
        legacySeg = decodeURIComponent(legacyMatch[1]);
      } catch {
        legacySeg = legacyMatch[1];
      }
    }
    const onMatchingCategory =
      pathOnly === "/market/sell" ||
      (pathOnly === "/market" && (!categoryFromQuery || categoryFromQuery === key)) ||
      legacySeg === key;
    if (!onMatchingCategory) return;
    try {
      sessionStorage.removeItem(TRADE_WRITE_SHEET_REOPEN_SESSION_FLAG_KEY);
      sessionStorage.removeItem(TRADE_WRITE_SHEET_REOPEN_CATEGORY_SESSION_KEY);
    } catch {
      /* ignore */
    }
    open(key);
  }, [pathname, open]);

  /**
   * 앱 종료·문서 재시작 뒤 — Lifecycle 이 유효 복원으로 시트 아래 경로를 돌려주면 시트를 다시 연다.
   * 초안(기기 보관 사진 포함)은 이어쓰기 질문 없이 바로 적용한다. Lifecycle 판정은 읽기만 한다.
   * 복원 경로보다 다른 경로(푸시·딥링크 등)가 먼저면 열지 않는다.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (sheetRestoreRef.current?.state === "done") return;
    if (!sheetRestoreRef.current) {
      const marker = readTradeWriteSheetOpenMarker();
      /** 인증·보완 복귀(`gate`)는 아래 전용 효과가 맡는다 */
      if (!marker || marker.gate) {
        sheetRestoreRef.current = { state: "done" };
        return;
      }
      const verdict = decideTradeWriteSheetReopen(
        getAppEntryDecision(),
        marker,
        getBoundAuthUserId(),
        documentCameFromTradeWriteGate()
      );
      console.info(`[trade-write-sheet] restore_decision verdict=${verdict} path=${marker.path}`);
      if (verdict !== "reopen") {
        clearTradeWriteSheetOpenMarker();
        sheetRestoreRef.current = { state: "done" };
        return;
      }
      sheetRestoreRef.current = { state: "pending", marker, bootPath: (pathname.split("?")[0] || "/").trim() };
    }
    const pending = sheetRestoreRef.current;
    if (pending.state !== "pending") return;
    if (openedInDocumentRef.current) {
      sheetRestoreRef.current = { state: "done" };
      return;
    }
    const p = (pathname.split("?")[0] || "/").trim();
    if (p === pending.marker.path) {
      sheetRestoreRef.current = { state: "done" };
      /** 카테고리가 있을 때만 — 없으면 폼이 마운트되지 않아 표시가 남고 다음 진입의 이어쓰기 질문을 건너뛰게 됨 */
      if (pending.marker.categoryKey) markTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
      open(pending.marker.categoryKey);
      return;
    }
    /**
     * 부팅 경로("/")에서 Lifecycle 복원 이동 1회만 기다린다 — 다음 경로가 복원 경로가 아니거나
     * 부팅 경로를 벗어난 뒤에는 대기를 끝내, 나중에 사용자가 그 경로로 갔을 때 시트가 갑자기 열리지 않게 한다.
     */
    if (p !== "/" || pending.bootPath !== "/") {
      clearTradeWriteSheetOpenMarker();
      sheetRestoreRef.current = { state: "done" };
    }
  }, [pathname, open]);

  /**
   * D5 — 「등록」 중 인증·보완 화면(동의·전화·프로필·로그인)에 다녀오면 시트를 다시 연다.
   * 같은 문서 이동(아래 close 효과가 표시)과 동의 완료 후 새 문서(등록 직전 표시) 모두 이 효과가 판정.
   */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    /** 시트가 열려 있으면 판정하지 않는다 (복귀 판정은 닫힌 뒤에만) */
    if (isOpen) return;
    const marker = readTradeWriteSheetOpenMarker();
    if (!marker?.gate) return;
    const baseline = gateDepartureOpenCountRef.current ?? 0;
    if (openCountRef.current !== baseline) {
      /** 주소 복귀 등 다른 경로가 이미 시트를 열었다 */
      gateDepartureOpenCountRef.current = null;
      return;
    }
    const entryKind = getAppEntryDecision().kind;
    const verdict = decideTradeWriteSheetGateReturn(marker, getBoundAuthUserId(), pathname, window.location.search, {
      /** Provider 는 (main) 밖 인증 화면에서 언마운트될 수 있어, ref 가 아니라 기록 시각으로 판정 */
      departedThisDocument: (marker.gateAt ?? 0) >= readDocumentStartedAtMs(),
      newDocumentFromGate:
        entryKind === "doc_reset" || entryKind === "os_restore" || documentCameFromTradeWriteGate(),
    });
    if (verdict === "wait") return;
    console.info(`[trade-write-sheet] gate_return verdict=${verdict} path=${marker.path}`);
    gateDepartureOpenCountRef.current = null;
    if (verdict === "discard") {
      clearTradeWriteSheetOpenMarker();
      return;
    }
    if (marker.categoryKey) markTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
    open(marker.categoryKey);
  }, [pathname, open, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const p = pathname.split("?")[0] ?? "";
    if (isTradeWriteSheetSurfacePath(p)) return;
    if (isTradeWriteGatePath(p, typeof window !== "undefined" ? window.location.search : "")) {
      /** 인증·보완 화면으로 나감 — 시트만 닫고 표시는 남겨 돌아오면 다시 연다 (D5) */
      markTradeWriteSheetGateDeparture();
      gateDepartureOpenCountRef.current = openCountRef.current;
      setBlockingDraft(false);
      setIsOpen(false);
      return;
    }
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
        title={t("ui_write_exit_title")}
        description={t("ui_write_exit_body")}
        cancelLabel={t("ui_write_exit_continue")}
        confirmLabel={t("ui_write_exit_confirm")}
        confirmTone="primary"
        onConfirm={handleExternalLeaveConfirm}
        zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}
        ariaLabel={t("ui_write_external_leave_aria")}
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
