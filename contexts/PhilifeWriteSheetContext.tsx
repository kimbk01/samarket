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

type PhilifeWriteSheetContextValue = {
  isOpen: boolean;
  /** 열릴 때마다 증가 — 폼 리셋 키 */
  openEpoch: number;
  /** URL `?category=`에 맞춤. 빈 문자열 = 기본(추천) 글쓰기 */
  initialCategory: string;
  open: (category: string) => void;
  close: () => void;
};

const PhilifeWriteSheetContext = createContext<PhilifeWriteSheetContextValue | null>(null);

export function PhilifeWriteSheetProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");

  const open = useCallback((category: string) => {
    setInitialCategory((category ?? "").trim());
    setOpenEpoch((e) => e + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const p = pathname.split("?")[0] ?? "";
    /** 글쓰기 시트는 필라이프/커뮤니티 **피드** 루트에만 둔다(상세·작성 풀페이지 등은 닫힘) */
    if (p === "/philife" || p === "/community") return;
    setIsOpen(false);
  }, [isOpen, pathname]);

  const value = useMemo(
    () => ({
      isOpen,
      openEpoch,
      initialCategory,
      open,
      close,
    }),
    [isOpen, openEpoch, initialCategory, open, close]
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
