"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getCategoryHref, getUnifiedWriteHref } from "@/lib/categories/getCategoryHref";
import { type CategoryWithSettings } from "@/lib/types/category";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import { TradeWriteForm } from "@/components/write/trade/TradeWriteForm";
import { JobsWriteForm } from "@/components/write/trade/JobsWriteForm";
import { ExchangeWriteForm } from "@/components/write/trade/ExchangeWriteForm";
import { CommunityWriteForm } from "@/components/write/community/CommunityWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";
import { WriteScreenTier1Sync } from "@/components/write/WriteScreenTier1Sync";

/** `PhilifeWriteBottomSheet` 과 동일한 패널 전환 시간 */
const WRITE_SHEET_TRANSITION_MS = 500;
const WRITE_SHEET_EXIT_GUARD_MS = 520;

/**
 * 글쓰기 단일 화면:
 * 1) 카테고리 선택
 * 2) 같은 /write 화면에서 타입별 폼으로 전환
 *
 * 시트: 전역 스티키 헤더(`[data-app-sticky-header]`) 바로 아래 ~ 화면 하단, 아래→위 `translate-y` (필라이프 글쓰기 시트와 동일).
 */
export default function WritePageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithSettings | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [formStatus, setFormStatus] = useState<
    "idle" | "redirecting" | "loading" | "found" | "not_found" | "no_write"
  >("idle");
  const [topOffsetPx, setTopOffsetPx] = useState(0);
  const [enterDraw, setEnterDraw] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const enterRafRef = useRef<number | null>(null);
  const exitInFlightRef = useRef(false);
  const categoryParam = searchParams.get("category")?.trim() ?? "";

  const measure = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    if (el) {
      setTopOffsetPx(Math.max(0, Math.round(el.getBoundingClientRect().bottom)));
    }
  }, []);

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
    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    const el = document.querySelector<HTMLElement>("[data-app-sticky-header]");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (el && ro) ro.observe(el);
    return () => {
      if (enterRafRef.current != null) {
        cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
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

  useEffect(() => {
    getCategories({ activeOnly: true }).then(setCategories);
  }, []);

  const byType = useMemo(
    () => ({
      trade: categories.filter((x) => x.type === "trade"),
      service: categories.filter((x) => x.type === "service"),
      community: categories.filter((x) => x.type === "community"),
      feature: categories.filter((x) => x.type === "feature"),
    }),
    [categories]
  );
  const selectableCategories = useMemo(
    () =>
      (Object.keys(byType) as Array<keyof typeof byType>).flatMap((type) =>
        byType[type].map((category) => category)
      ),
    [byType]
  );

  const loadSelectedCategory = useCallback(
    async (value: string) => {
      if (!value) {
        setSelectedCategory(null);
        setFormStatus("idle");
        return;
      }
      const user = getCurrentUser();
      if (!ensureClientAccessOrRedirect(router, user, pathname || "/write")) {
        setSelectedCategory(null);
        setFormStatus("redirecting");
        return;
      }
      setFormStatus("loading");
      try {
        const c = await getCategoryBySlugOrId(value);
        if (!c) {
          setSelectedCategory(null);
          setFormStatus("not_found");
          return;
        }
        if (c.settings && !c.settings.can_write) {
          setSelectedCategory(c);
          setFormStatus("no_write");
          return;
        }
        setSelectedCategory(c);
        setFormStatus("found");
      } catch {
        setSelectedCategory(null);
        setFormStatus("not_found");
      }
    },
    [router, pathname]
  );

  useEffect(() => {
    void loadSelectedCategory(categoryParam);
  }, [categoryParam, loadSelectedCategory]);

  const handleSelect = useCallback(
    (c: CategoryWithSettings) => {
      if (!c.settings?.can_write) return;
      router.push(getUnifiedWriteHref(c));
    },
    [router]
  );
  const handleDropdownChange = useCallback(
    (value: string) => {
      const currentId = selectedCategory?.id ?? "";
      if (value === currentId) return;
      if (isFormDirty && selectedCategory) {
        const ok = window.confirm(
          "카테고리를 변경하면 현재 입력한 내용이 사라질 수 있습니다. 카테고리를 변경하시겠어요?"
        );
        if (!ok) return;
      }
      if (!value) {
        setIsFormDirty(false);
        router.push("/write");
        return;
      }
      const selected = categories.find((c) => c.id === value);
      if (!selected || !selected.settings?.can_write) return;
      setIsFormDirty(false);
      handleSelect(selected);
    },
    [categories, handleSelect, isFormDirty, router, selectedCategory]
  );

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
    if (isFormDirty && selectedCategory) {
      const ok = window.confirm("작성 중인 내용이 있습니다. 취소하면 입력한 내용이 사라집니다. 닫으시겠어요?");
      if (!ok) return;
    }
    setIsFormDirty(false);
    runExitThen(() => {
      router.replace("/home");
    });
  }, [isFormDirty, selectedCategory, router, runExitThen]);

  const handleSuccess = useCallback(
    (_postId: string) => {
      if (!selectedCategory) return;
      setIsFormDirty(false);
      runExitThen(() => {
        router.replace(getCategoryHref(selectedCategory));
      });
    },
    [selectedCategory, router, runExitThen]
  );

  const markDirtyByFormInteraction = useCallback((event: React.SyntheticEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.id === "write-category-select") return;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      setIsFormDirty(true);
    }
  }, []);

  const renderWriteForm = () => {
    if (formStatus === "loading") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">불러오는 중…</p>;
    }
    if (formStatus === "redirecting") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">권한 확인 중…</p>;
    }
    if (formStatus === "not_found") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">카테고리를 찾을 수 없습니다.</p>;
    }
    if (formStatus === "no_write") {
      return <p className="py-10 text-center sam-text-body text-sam-muted">이 카테고리에는 글을 쓸 수 없습니다.</p>;
    }
    if (formStatus !== "found" || !selectedCategory) return null;

    switch (selectedCategory.type) {
      case "trade":
        if (selectedCategory.icon_key === "jobs" || selectedCategory.icon_key === "job") {
          return (
            <JobsWriteForm
              category={selectedCategory}
              onSuccess={handleSuccess}
              onCancel={closeWriteSheetToHome}
              suppressTier1Chrome
            />
          );
        }
        if (
          selectedCategory.icon_key === "exchange" ||
          selectedCategory.slug === "exchange" ||
          selectedCategory.slug === "current"
        ) {
          return (
            <ExchangeWriteForm
              category={selectedCategory}
              onSuccess={handleSuccess}
              onCancel={closeWriteSheetToHome}
              suppressTier1Chrome
            />
          );
        }
        return (
          <TradeWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={closeWriteSheetToHome}
            suppressTier1Chrome
          />
        );
      case "community":
        return (
          <CommunityWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={closeWriteSheetToHome}
            suppressTier1Chrome
          />
        );
      case "service":
        return (
          <ServiceWriteForm
            category={selectedCategory}
            onSuccess={handleSuccess}
            onCancel={closeWriteSheetToHome}
            suppressTier1Chrome
          />
        );
      case "feature":
        return (
          <FeatureWriteBlock category={selectedCategory} onCancel={closeWriteSheetToHome} suppressTier1Chrome />
        );
      default:
        return <p className="py-10 text-center sam-text-body text-sam-muted">지원하지 않는 카테고리 타입입니다.</p>;
    }
  };

  const panelOpen = enterDraw && !isExiting;

  return (
    <>
      <WriteScreenTier1Sync
        title="글쓰기"
        backHref="/home"
        onRequestClose={closeWriteSheetToHome}
        subtitle={
          categoryParam && selectedCategory && formStatus === "found" ? selectedCategory.name : undefined
        }
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
            <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-3">
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
                <label
                  htmlFor="write-category-select"
                  className="mb-2 block sam-text-body-secondary font-semibold text-[#666666]"
                >
                  카테고리 선택
                </label>
                <select
                  id="write-category-select"
                  value={selectedCategory?.id ?? ""}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                  className="h-11 w-full rounded-sam-md border border-sam-border bg-white px-3 sam-text-body text-sam-fg outline-none focus:border-sam-primary"
                  disabled={selectableCategories.length === 0}
                >
                  <option value="">카테고리를 선택하세요</option>
                  {selectableCategories.map((category) => (
                    <option key={category.id} value={category.id} disabled={!category.settings?.can_write}>
                      {category.name}
                      {!category.settings?.can_write ? " (작성 불가)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {!categoryParam ? (
                <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
                  <p className="px-4 py-10 text-center sam-text-body text-sam-muted">
                    카테고리를 선택하면 아래에 같은 화면에서 글쓰기 폼이 열립니다.
                  </p>
                </div>
              ) : (
                <div
                  className="min-w-0"
                  onChangeCapture={markDirtyByFormInteraction}
                  onInputCapture={markDirtyByFormInteraction}
                >
                  {renderWriteForm()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
