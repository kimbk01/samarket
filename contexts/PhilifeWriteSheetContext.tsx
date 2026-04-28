"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";

type PhilifeWriteSheetContextValue = {
  isOpen: boolean;
  /** 열릴 때마다 증가 — 폼 리셋 키 */
  openEpoch: number;
  /** URL `?category=`에 맞춤. 빈 문자열 = 기본(추천) 글쓰기 */
  initialCategory: string;
  /** 시트 폼 — `PhilifeNeighborhoodWriteForm` 이 갱신 */
  blockingDraft: boolean;
  setBlockingDraft: (v: boolean) => void;
  /** 다른 메뉴·탭 이동 전 — 초안 있으면 확인 후 시트 닫기. `true`면 네비게이션 진행 */
  attemptLeaveForExternalNavigation: () => boolean;
  open: (category: string) => void;
  close: () => void;
};

const PhilifeWriteSheetContext = createContext<PhilifeWriteSheetContextValue | null>(null);

export function PhilifeWriteSheetProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");
  const [blockingDraft, setBlockingDraft] = useState(false);

  const open = useCallback(
    (category: string) => {
      const user = getCurrentUser();
      if (user?.id && !clientHasVerifiedContactForInteractive(user)) {
        const q = typeof window !== "undefined" ? window.location.search : "";
        openPhoneVerificationRequiredDialog({ next: `${pathname}${q}` });
        return;
      }
      setInitialCategory((category ?? "").trim());
      setOpenEpoch((e) => e + 1);
      setBlockingDraft(false);
      setIsOpen(true);
    },
    [pathname]
  );

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

  useEffect(() => {
    if (!isOpen) return;
    const p = pathname.split("?")[0] ?? "";
    /** 글쓰기 시트는 필라이프/커뮤니티 **피드** 루트에만 둔다(상세·작성 풀페이지 등은 닫힘) */
    if (p === "/philife" || p === "/community") return;
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
    <PhilifeWriteSheetContext.Provider value={value}>
      {children}
    </PhilifeWriteSheetContext.Provider>
  );
}

export function usePhilifeWriteSheet() {
  const v = useContext(PhilifeWriteSheetContext);
  if (!v) {
    throw new Error("usePhilifeWriteSheet must be used within PhilifeWriteSheetProvider");
  }
  return v;
}

/**
 * `PhilifeHeaderComposeButton` 대체(폴백) 등: Provider 밖에서도 쓰일 수 있게 래핑.
 * 시트 API가 없으면 `null`.
 */
export function usePhilifeWriteSheetOptional(): PhilifeWriteSheetContextValue | null {
  return useContext(PhilifeWriteSheetContext);
}
