"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { PhilifeWriteLeaveSheet } from "@/components/philife/PhilifeWriteComposerChrome";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type PhilifeWriteSheetContextValue = {
  isOpen: boolean;
  /** 열릴 때마다 증가 — 폼 리셋 키 */
  openEpoch: number;
  /** URL `?category=`에 맞춤. 빈 문자열 = 기본(추천) 글쓰기 */
  initialCategory: string;
  /** 시트 폼 — `PhilifeNeighborhoodWriteForm` 이 갱신 */
  blockingDraft: boolean;
  setBlockingDraft: (v: boolean) => void;
  /** 다른 메뉴·탭 이동 전 — 초안 있으면 확인 후 시트 닫기 */
  attemptLeaveForExternalNavigation: (nextHref?: string | null) => boolean;
  open: (category: string) => void;
  close: () => void;
};

const PhilifeWriteSheetContext = createContext<PhilifeWriteSheetContextValue | null>(null);


export function PhilifeWriteSheetProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [openEpoch, setOpenEpoch] = useState(0);
  const [initialCategory, setInitialCategory] = useState("");
  const [blockingDraft, setBlockingDraft] = useState(false);
  const [externalLeaveOpen, setExternalLeaveOpen] = useState(false);
  const pendingNavHrefRef = useRef<string | null>(null);

  const open = useCallback(
    (category: string) => {
      const q = typeof window !== "undefined" ? window.location.search : "";
      const next = `${pathname}${q}`;
      void requireAuthAction(
        "community_write",
        () => {
          setInitialCategory((category ?? "").trim());
          setOpenEpoch((e) => e + 1);
          setBlockingDraft(false);
          setIsOpen(true);
        },
        { next },
      );
    },
    [pathname],
  );

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
    close();
    setExternalLeaveOpen(false);
    const href = pendingNavHrefRef.current;
    pendingNavHrefRef.current = null;
    if (href) router.push(href);
  }, [close, router]);

  useEffect(() => {
    if (!isOpen) return;
    const p = pathname.split("?")[0] ?? "";
    /** 글쓰기 시트는 필라이프/커뮤니티 **피드** 루트에만 둔다(상세·작성 풀페이지 등은 닫힘) */
    if (isCommunityHomeSurfacePath(p)) return;
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
      {/* 탭·화면 이동도 작성기와 같은 나가기 시트 1종 (Owner 확정 2026-11-01) */}
      <PhilifeWriteLeaveSheet
        open={externalLeaveOpen}
        title={t("philife_write_leave_title")}
        body={t("philife_write_leave_body")}
        stayLabel={t("philife_write_leave_stay")}
        leaveLabel={t("philife_write_leave_go")}
        onStay={handleExternalLeaveCancel}
        onLeave={handleExternalLeaveConfirm}
      />
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
