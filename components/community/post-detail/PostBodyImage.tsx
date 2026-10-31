"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  POST_BODY_IMAGE_MAX_HEIGHT,
  POST_IMAGE_PLACEHOLDER_ASPECT,
  resolvePostImageSources,
  type PostImageSurface,
} from "@/lib/community/post-image-display";

const FILL_STYLE = { width: "100%", height: "100%" } as const;

type LoadState = { attempt: 0 | 1; status: "loading" | "loaded" | "error"; retryKey: number };

/** 파생본 → 원본 1회 재시도 → 실패 표시·다시 시도. 칸 모양은 호출부가 정한다. */
function usePostImageLoad(raw: string, surface: PostImageSurface) {
  const sources = useMemo(() => resolvePostImageSources(raw, surface), [raw, surface]);
  const [state, setState] = useState<LoadState>({ attempt: 0, status: "loading", retryKey: 0 });
  const [shownPrimary, setShownPrimary] = useState(sources.primary);
  if (shownPrimary !== sources.primary) {
    /** 다른 사진으로 바뀐 경우에만 처음 상태로 (렌더 중 동기 갱신 — 첫 렌더 상태는 건드리지 않음) */
    setShownPrimary(sources.primary);
    setState({ attempt: 0, status: "loading", retryKey: 0 });
  }
  const src = state.attempt === 0 ? sources.primary : sources.original;
  return {
    src,
    status: state.status,
    retryKey: state.retryKey,
    onLoad: () => setState((s) => ({ ...s, status: "loaded" })),
    onError: () =>
      setState((s) =>
        s.attempt === 0 && sources.original && sources.original !== sources.primary
          ? { ...s, attempt: 1 }
          : { ...s, status: "error" }
      ),
    retry: () => setState((s) => ({ attempt: 0, status: "loading", retryKey: s.retryKey + 1 })),
    /** SSR 로 먼저 그려져 하이드레이션 전에 로드·실패가 끝난 경우 — onLoad/onError 를 놓치지 않게 확인 */
    bindImage: (el: HTMLImageElement | null) => {
      if (!el || !el.complete || state.status !== "loading") return;
      if (el.naturalWidth > 0) setState((s) => (s.status === "loading" ? { ...s, status: "loaded" } : s));
      else if (el.currentSrc || el.src) el.dispatchEvent(new Event("error"));
    },
  };
}

function FailedOverlay({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sam-surface-muted px-3 text-center">
      <span className="text-[13px] text-sam-muted">{t("community_image_load_failed")}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onRetry();
          }
        }}
        className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-medium text-sam-fg"
      >
        {t("common_retry")}
      </span>
    </span>
  );
}

/**
 * 글 상세 본문 사진 한 장 — 원본 비율 그대로 화면 폭에 맞춤(잘림 없음), 로드 전 자리 확보.
 * 회원 교차 본문·가져온 글·첨부 1장 공통 (D1·D4·D5·D10·D13).
 */
export function PostBodyImage({
  src: raw,
  alt = "",
  label,
  onOpen,
  priority = false,
}: {
  src: string;
  alt?: string;
  label: string;
  onOpen: () => void;
  priority?: boolean;
}) {
  const { src, status, retryKey, onLoad, onError, retry, bindImage } = usePostImageLoad(raw, "detail");
  const loaded = status === "loaded";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid="post-body-image"
      data-image-status={status}
      className="relative my-0.5 block w-full cursor-zoom-in overflow-hidden rounded-ui-rect bg-sam-surface-muted"
      style={loaded ? undefined : { aspectRatio: POST_IMAGE_PLACEHOLDER_ASPECT }}
    >
      {status === "loading" ? <span className="absolute inset-0 animate-pulse bg-sam-surface-muted" aria-hidden /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지(자연 높이), 파생본·원본 재시도 직접 제어 */}
      <img
        key={`${src}#${retryKey}`}
        ref={bindImage}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={onLoad}
        onError={onError}
        className={
          loaded
            ? "mx-auto block h-auto w-auto max-w-full object-contain"
            : "absolute inset-0 object-contain opacity-0"
        }
        /** 전역 `img { height:auto }`(레이어 밖)가 Tailwind `h-full` 을 이기므로 크기는 인라인으로 고정 */
        style={loaded ? { maxHeight: POST_BODY_IMAGE_MAX_HEIGHT } : FILL_STYLE}
      />
      {status === "error" ? <FailedOverlay onRetry={retry} /> : null}
    </button>
  );
}

/** 격자 한 칸 — 칸 크기는 호출부 aspect-ratio 로 확정(0px 없음), 칸 안은 가운데 맞춰 채움. */
export function PostImageGridCellImage({
  src: raw,
  surface,
  label,
  onOpen,
  priority = false,
  overlay,
  className,
}: {
  src: string;
  surface: PostImageSurface;
  label: string;
  onOpen: () => void;
  priority?: boolean;
  overlay?: React.ReactNode;
  className: string;
}) {
  const { src, status, retryKey, onLoad, onError, retry, bindImage } = usePostImageLoad(raw, surface);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid="post-body-image"
      data-image-status={status}
      className={`relative block w-full cursor-zoom-in overflow-hidden bg-sam-surface-muted ${className}`}
    >
      {status === "loading" ? <span className="absolute inset-0 animate-pulse bg-sam-surface-muted" aria-hidden /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- 칸 채움·재시도 직접 제어 */}
      <img
        key={`${src}#${retryKey}`}
        ref={bindImage}
        src={src}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        className={`absolute inset-0 object-cover ${status === "loaded" ? "" : "opacity-0"}`}
        style={FILL_STYLE}
      />
      {status === "error" ? <FailedOverlay onRetry={retry} /> : null}
      {overlay}
    </button>
  );
}
