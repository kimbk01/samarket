"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { Sam } from "@/lib/ui/sam-component-classes";

export type MyListPagerProps = {
  hasMore: boolean;
  loading: boolean;
  /** 다음 페이지 실패 — true 또는 메시지. 자동 로드를 멈추고 [다시 시도] 표시 */
  error?: boolean | string | null;
  onLoadMore: () => void | Promise<unknown>;
};

/**
 * 커서 "더 보기" (최종 설계 §1.2) — 하단 도달 시 자동 로드 + [더 보기] 버튼, 실패 시 [다시 시도].
 * 같은 페이저의 중복 호출은 `runSingleFlight` 로 하나로 합친다.
 * 첫 페이지 로딩·오류는 `MyStateView` 담당 — 이 부품은 목록 아래 추가 페이지만.
 */
export function MyListPager({ hasMore, loading, error, onLoadMore }: MyListPagerProps) {
  const { t } = useI18n();
  const flightKey = `mypage-list-pager:${useId()}`;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const failed = Boolean(error);

  const load = useCallback(() => {
    void runSingleFlight(flightKey, async () => {
      await onLoadMore();
    }).catch(() => undefined);
  }, [flightKey, onLoadMore]);

  const autoEnabled = hasMore && !loading && !failed;
  useEffect(() => {
    if (!autoEnabled) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load();
      },
      { rootMargin: "0px 0px 240px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoEnabled, load]);

  if (!hasMore && !failed) return null;

  if (failed) {
    return (
      <div role="alert" data-testid="my-list-pager-error" className="flex flex-col items-center gap-2 px-4 py-4 text-center">
        <p className="sam-text-helper text-sam-muted">
          {typeof error === "string" && error.trim() ? error : t("mypage_comp_ds_load_more_failed")}
        </p>
        <button
          type="button"
          data-testid="my-list-pager-retry"
          onClick={load}
          disabled={loading}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing}`}
        >
          {t("common_retry")}
        </button>
      </div>
    );
  }

  return (
    <div ref={sentinelRef} data-testid="my-list-pager" className="flex justify-center px-4 py-4">
      <button
        type="button"
        data-testid="my-list-pager-more"
        onClick={load}
        disabled={loading}
        aria-busy={loading}
        className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} ${Sam.focusRing} min-w-[120px]`}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded-full border-2 border-sam-border border-t-sam-primary motion-safe:animate-spin"
          />
        ) : (
          t("mypage_comp_ds_load_more")
        )}
      </button>
    </div>
  );
}
