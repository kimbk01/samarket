"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/types/category";
import { WriteScreenTier1Sync } from "@/components/write/WriteScreenTier1Sync";
import { WriteSheetFlowInner } from "@/components/write/WriteSheetFlowInner";

/** `PhilifeWriteBottomSheet` · `TradeWriteBottomSheet` 과 동일한 패널 전환 시간 */
const WRITE_SHEET_TRANSITION_MS = 500;
const WRITE_SHEET_EXIT_GUARD_MS = 520;

/**
 * 글쓰기 단일 화면:
 * 1) 카테고리 선택
 * 2) 같은 /write 화면에서 타입별 폼으로 전환
 *
 * 시트: 전역 스티키 헤더(`[data-app-sticky-header]`) 바로 아래 ~ 화면 하단, 아래→위 `translate-y` (필라이프·거래 시트와 동일).
 */
export default function WritePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [topOffsetPx, setTopOffsetPx] = useState(0);
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [tierSubtitle, setTierSubtitle] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const enterRafRef = useRef<number | null>(null);
  const exitInFlightRef = useRef(false);
  const tryCloseFromFlowRef = useRef<() => void>(() => {});
  const categoryParam = searchParams.get("category")?.trim() ?? "";

  const measure = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    if (el) {
      setTopOffsetPx(Math.max(0, Math.round(el.getBoundingClientRect().bottom)));
    }
  }, []);

  /** 시트 아래→위 진입은 마운트 시 한 번만(?category= 변경 시 깜빡임 방지) */
  useLayoutEffect(() => {
    if (enterRafRef.current != null) {
      cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = null;
    }
    setIsExiting(false);
    measure();
    setEnterDraw(false);
    enterRafRef.current = requestAnimationFrame(() => {
      enterRafRef.current = null;
      setEnterDraw(true);
      measure();
    });
    return () => {
      if (enterRafRef.current != null) {
        cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
    };
  }, [measure]);

  /** 같은 /write 에서 `?category=`·path만 바뀔 때 스티키 오프셋 재측정 */
  useLayoutEffect(() => {
    measure();
  }, [measure, categoryParam, pathname]);

  useLayoutEffect(() => {
    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      ro?.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const runExitThen = useCallback((after: () => void) => {
    if (exitInFlightRef.current) {
      return;
    }
    exitInFlightRef.current = true;
    setIsExiting(true);
    const el = panelRef.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      exitInFlightRef.current = false;
      after();
    };
    if (!el) {
      window.setTimeout(finish, 0);
      return;
    }
    const safety = window.setTimeout(finish, WRITE_SHEET_EXIT_GUARD_MS + 150);
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== "transform") return;
      clearTimeout(safety);
      el.removeEventListener("transitionend", onEnd);
      finish();
    };
    requestAnimationFrame(() => {
      el.addEventListener("transitionend", onEnd, { once: true });
    });
  }, []);

  const closeWriteSheetToHome = useCallback(() => {
    runExitThen(() => {
      router.replace("/home");
    });
  }, [router, runExitThen]);

  const handleSuccessNavigate = useCallback(
    (category: CategoryWithSettings, _postId: string) => {
      runExitThen(() => {
        router.replace(getCategoryHref(category));
      });
    },
    [router, runExitThen]
  );

  const panelOpen = enterDraw && !isExiting;

  return (
    <>
      <WriteScreenTier1Sync
        title="글쓰기"
        backHref="/home"
        onRequestClose={() => tryCloseFromFlowRef.current()}
        subtitle={tierSubtitle}
      />
      <div
        className="pointer-events-none fixed left-0 right-0 z-[15] flex flex-col"
        style={{ top: topOffsetPx, bottom: 0 }}
        role="presentation"
      >
        <div
          ref={panelRef}
          className={`pointer-events-auto flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-t border-sam-border bg-[#F7F7F7] text-sam-fg shadow-[0_-10px_26px_rgba(0,0,0,0.12)] transition-transform ease-[cubic-bezier(0.25,0.1,0.2,1)] ${
            panelOpen ? "translate-y-0" : "translate-y-full"
          }`}
          style={{ transitionDuration: `${WRITE_SHEET_TRANSITION_MS}ms` }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <WriteSheetFlowInner
              mode="page"
              categoryKey={categoryParam}
              pathnameForAuth={pathname || "/write"}
              onUserRequestClose={closeWriteSheetToHome}
              onSuccessNavigate={handleSuccessNavigate}
              onTierSubtitleChange={setTierSubtitle}
              onExposeTryClose={(fn) => {
                tryCloseFromFlowRef.current = fn;
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
