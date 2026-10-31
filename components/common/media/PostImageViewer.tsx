"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveMessengerImageSaveMode,
  type MessengerImageSaveMode,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import { saveMessengerPhotosWithFeedback } from "@/components/community-messenger/room/messenger-photo-save-feedback";
import { originalImageUrl } from "@/lib/community/post-media-embed";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  IDENTITY,
  SLOP_PX,
  clampTransform,
  dismissProgress,
  doubleTapTarget,
  fitSize,
  isZoomed,
  lockAxis,
  naturalSizeScale,
  pageDecision,
  rubberBand,
  shouldDismiss,
  zoomAround,
  type DragAxis,
  type Size,
  type ViewTransform,
} from "@/lib/ui/image-viewer-transform";

/**
 * Community post image viewer — tap an image in a post → full screen over the post (no navigation).
 *
 * CONTRACT:
 * - Portal to `document.body`; page scroll locked while open and the post's scroll position restored on close.
 * - Back: one history entry (same URL, Next `__NA` state kept — same pattern as SupportModalHost) so
 *   Android device back / browser back / iOS edge swipe close the viewer instead of leaving the post.
 *   Closing from the UI pops that entry. No Capacitor `backButton` listener (DibayOverlayRoot contract).
 * - Gestures: see lib/ui/image-viewer-transform.ts (zoomed drag pans only; paging/dismiss only at fit).
 * - Save reuses the messenger photo-save SSOT (native photo library / web share) — not a download link.
 */

const HISTORY_KEY = "__dibayPostImageViewer";
const ANIM_MS = 220;

type Pt = { x: number; y: number };
type Gesture =
  | { mode: "none" }
  | {
      mode: "drag";
      start: Pt;
      startT: ViewTransform;
      zoomedAtStart: boolean;
      axis: DragAxis;
      last: Pt;
      lastTime: number;
      v: Pt;
      moved: boolean;
    }
  | { mode: "pinch"; startDist: number; startMid: Pt; startT: ViewTransform };

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type SlideLoad = { attempt: 0 | 1; status: "loading" | "loaded" | "error"; retryKey: number };
const SLIDE_INITIAL: SlideLoad = { attempt: 0, status: "loading", retryKey: 0 };

export function PostImageViewer(props: {
  open: boolean;
  urls: string[];
  index: number;
  onClose: () => void;
  /**
   * 화면용 주소(예: 커뮤니티 `.detail` 파생본). 실패하면 원본(`urls`)으로 1회 자동 재시도.
   * 「원본」 보기·저장은 항상 원본. 없으면 원본만 쓴다(거래·매장 기존 동작).
   */
  displayUrlFor?: (url: string) => string;
}) {
  const { open, urls, onClose, displayUrlFor } = props;
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(props.index);
  const [transform, setTransform] = useState<ViewTransform>(IDENTITY);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [natural, setNatural] = useState<Record<number, Size>>({});
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [saveMode, setSaveMode] = useState<MessengerImageSaveMode>("none");
  const [saving, setSaving] = useState(false);
  /** 슬라이드별 로딩·실패·재시도 상태 (D10) — 열 때마다 초기화 */
  const [slideLoad, setSlideLoad] = useState<Record<number, SlideLoad>>({});

  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture>({ mode: "none" });
  const lastTap = useRef<{ at: number; p: Pt } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);
  const savedScrollY = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const count = urls.length;
  const safeIndex = Math.max(0, Math.min(count - 1, index));
  const fitted = fitSize(natural[safeIndex] ?? stage, stage);

  useEffect(() => setMounted(true), []);

  // Each open starts on the tapped image, at fit, chrome visible.
  useEffect(() => {
    if (!open) return;
    setIndex(props.index);
    setTransform(IDENTITY);
    setDragX(0);
    setDragY(0);
    setChrome(true);
    setShowOriginal(false);
    setSlideLoad({});
  }, [open, props.index]);

  useEffect(() => {
    setTransform(IDENTITY);
    setShowOriginal(false);
  }, [safeIndex]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveMessengerImageSaveMode().then((m) => {
      if (!cancelled) setSaveMode(m);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // History entry: device/browser back closes the viewer (not the post).
  useEffect(() => {
    if (!open) {
      if (historyPushed.current && !closingFromPop.current) {
        historyPushed.current = false;
        try {
          if (window.history.state?.[HISTORY_KEY]) window.history.back();
        } catch {
          /* ignore */
        }
      }
      closingFromPop.current = false;
      return;
    }
    if (!historyPushed.current) {
      try {
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
        historyPushed.current = true;
      } catch {
        /* ignore */
      }
    }
    const onPop = () => {
      if (!historyPushed.current) return;
      historyPushed.current = false;
      closingFromPop.current = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  // Scroll lock + restore the post's scroll position on close.
  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    savedScrollY.current = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // iOS Safari: stop the page itself from pinch-zooming under the viewer.
    const stopGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stopGesture, { passive: false });
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      document.removeEventListener("gesturestart", stopGesture);
      const y = savedScrollY.current;
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      });
    };
  }, [open]);

  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, mounted]);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (animTimer.current) clearTimeout(animTimer.current);
    },
    [],
  );

  const animate = useCallback((fn: () => void, after?: () => void) => {
    setAnimating(true);
    fn();
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => {
      setAnimating(false);
      after?.();
    }, ANIM_MS);
  }, []);

  const goTo = useCallback(
    (dir: -1 | 1) => {
      const next = safeIndex + dir;
      if (next < 0 || next >= count || stage.w <= 0) return;
      animate(
        () => setDragX(-dir * stage.w),
        () => {
          setIndex(next);
          setDragX(0);
        },
      );
    },
    [animate, count, safeIndex, stage.w],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "ArrowLeft") goTo(-1);
      else if (e.key === "ArrowRight") goTo(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goTo]);

  const toStageCentre = useCallback((p: Pt): Pt => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 };
  }, []);

  const beginDrag = useCallback(
    (p: Pt, current: ViewTransform) => {
      gesture.current = {
        mode: "drag",
        start: p,
        startT: current,
        zoomedAtStart: isZoomed(current),
        axis: null,
        last: p,
        lastTime: performance.now(),
        v: { x: 0, y: 0 },
        moved: false,
      };
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (animating) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      beginDrag(p, transform);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      setDragX(0);
      setDragY(0);
      gesture.current = {
        mode: "pinch",
        startDist: Math.max(1, dist(a, b)),
        startMid: toStageCentre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        startT: transform,
      };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const mid = toStageCentre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const z = zoomAround(g.startT, g.startT.scale * (dist(a, b) / g.startDist), g.startMid);
      setTransform({ scale: z.scale, x: z.x + (mid.x - g.startMid.x), y: z.y + (mid.y - g.startMid.y) });
      return;
    }
    if (g.mode !== "drag") return;
    const now = performance.now();
    const dtMs = Math.max(1, now - g.lastTime);
    g.v = { x: (p.x - g.last.x) / dtMs, y: (p.y - g.last.y) / dtMs };
    g.last = p;
    g.lastTime = now;
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) >= SLOP_PX) g.moved = true;
    if (!g.moved) return;
    if (g.zoomedAtStart) {
      setTransform(clampTransform({ ...g.startT, x: g.startT.x + dx, y: g.startT.y + dy }, fitted, stage));
      return;
    }
    if (!g.axis) g.axis = lockAxis(dx, dy);
    if (g.axis === "x" && count > 1) setDragX(rubberBand(dx, safeIndex, count));
    else if (g.axis === "y") setDragY(dy > 0 ? dy : dy * 0.2);
  };

  const handleTap = (p: Pt) => {
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.at < DOUBLE_TAP_MS && dist(prev.p, p) < DOUBLE_TAP_SLOP_PX) {
      lastTap.current = null;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      const target = doubleTapTarget(transform, toStageCentre(p), fitted, stage);
      animate(() => setTransform(target));
      if (!isZoomed(target)) setShowOriginal(false);
      return;
    }
    lastTap.current = { at: now, p };
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setChrome((v) => !v);
    }, DOUBLE_TAP_MS);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.mode === "pinch") {
      if (pointers.current.size === 1) {
        // Remaining finger continues as a pan from the current zoom — no jump.
        const [rest] = [...pointers.current.values()] as [Pt];
        const settled = clampTransform(transform, fitted, stage);
        setTransform(settled);
        beginDrag(rest, settled);
        const ng = gesture.current;
        if (ng.mode === "drag") ng.zoomedAtStart = true;
      } else if (pointers.current.size === 0) {
        gesture.current = { mode: "none" };
        animate(() => setTransform((cur) => clampTransform(cur, fitted, stage)));
      }
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = { mode: "none" };
    if (g.mode !== "drag") return;
    if (!g.moved) {
      handleTap({ x: e.clientX, y: e.clientY });
      return;
    }
    if (g.zoomedAtStart) return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (g.axis === "x" && count > 1) {
      const dir = pageDecision(dx, g.v.x, stage.w, safeIndex, count);
      if (dir === 0) animate(() => setDragX(0));
      else goTo(dir);
    } else if (g.axis === "y") {
      if (shouldDismiss(dy, g.v.y)) onCloseRef.current();
      else animate(() => setDragY(0));
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = { mode: "none" };
      animate(() => {
        setDragX(0);
        setDragY(0);
        setTransform((cur) => clampTransform(cur, fitted, stage));
      });
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const focal = toStageCentre({ x: e.clientX, y: e.clientY });
    const next = zoomAround(transform, transform.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), focal);
    setTransform(clampTransform(next, fitted, stage));
  };

  const toggleOriginal = () => {
    if (showOriginal) {
      setShowOriginal(false);
      animate(() => setTransform(IDENTITY));
      return;
    }
    setShowOriginal(true);
    const nat = natural[safeIndex];
    if (nat) animate(() => setTransform(clampTransform({ scale: naturalSizeScale(nat, fitted), x: 0, y: 0 }, fitted, stage)));
  };

  const runSave = async () => {
    const url = urls[safeIndex];
    if (!url || saving) return;
    setSaving(true);
    try {
      await saveMessengerPhotosWithFeedback([originalImageUrl(url)], { t });
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted || count === 0 || typeof document === "undefined") return null;

  const fade = 1 - dismissProgress(dragY) * 0.85;
  const transition = animating ? `transform ${ANIM_MS}ms cubic-bezier(0.2,0.8,0.2,1)` : "none";
  const slides = [safeIndex - 1, safeIndex, safeIndex + 1].filter((i) => i >= 0 && i < count);

  const node = (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden overscroll-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("cm_ui_image_zoom_view")}
      data-testid="post-image-viewer"
      style={{ backgroundColor: `rgba(0,0,0,${fade})` }}
    >
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
        data-testid="post-image-viewer-stage"
      >
        {slides.map((i) => {
          const isCurrent = i === safeIndex;
          const tr = isCurrent ? transform : IDENTITY;
          const load = slideLoad[i] ?? SLIDE_INITIAL;
          const original = originalImageUrl(urls[i]!);
          const display = displayUrlFor ? displayUrlFor(urls[i]!) : urls[i]!;
          const src = (isCurrent && showOriginal) || load.attempt === 1 ? original : display;
          const setLoad = (next: (cur: SlideLoad) => SlideLoad) =>
            setSlideLoad((m) => ({ ...m, [i]: next(m[i] ?? SLIDE_INITIAL) }));
          return (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate3d(calc(${(i - safeIndex) * 100}% + ${dragX}px), ${isCurrent ? dragY : 0}px, 0)`,
                transition,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- zoom transform needs the plain element */}
              <img
                key={`${src}#${load.retryKey}`}
                src={src}
                alt=""
                draggable={false}
                decoding="async"
                data-testid={isCurrent ? "post-image-viewer-current" : undefined}
                data-image-status={load.status}
                onLoad={(ev) => {
                  const el = ev.currentTarget;
                  if (el.naturalWidth > 0) setNatural((m) => (m[i] ? m : { ...m, [i]: { w: el.naturalWidth, h: el.naturalHeight } }));
                  setLoad((cur) => (cur.status === "loaded" ? cur : { ...cur, status: "loaded" }));
                }}
                onError={() =>
                  setLoad((cur) =>
                    cur.attempt === 0 && src !== original ? { ...cur, attempt: 1 } : { ...cur, status: "error" }
                  )
                }
                className="max-h-full max-w-full object-contain will-change-transform"
                style={{ transform: `translate3d(${tr.x}px, ${tr.y}px, 0) scale(${tr.scale})`, transition }}
              />
              {load.status === "loading" ? (
                <span
                  className="pointer-events-none absolute h-9 w-9 animate-spin rounded-full border-[3px] border-white/25 border-t-white"
                  aria-hidden
                  data-testid={isCurrent ? "post-image-viewer-loading" : undefined}
                />
              ) : null}
              {load.status === "error" ? (
                <span className="absolute flex flex-col items-center gap-3 px-6 text-center" data-testid={isCurrent ? "post-image-viewer-error" : undefined}>
                  <span className="text-[14px] text-white/85">{t("community_image_load_failed")}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLoad((cur) => ({ attempt: 0, status: "loading", retryKey: cur.retryKey + 1 }));
                    }}
                    className="min-h-10 rounded-full bg-white/15 px-5 text-[14px] font-medium text-white active:bg-white/25"
                  >
                    {t("common_retry")}
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className={`pointer-events-none relative z-[1] flex flex-1 flex-col justify-between pt-[var(--safe-top)] pb-[var(--safe-bottom)] transition-opacity duration-200 ${
          chrome && dragY === 0 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex items-center justify-between gap-2 bg-gradient-to-b from-black/50 to-transparent px-2 py-2">
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[22px] leading-none text-white active:bg-white/15"
            aria-label={t("nav_close")}
            data-testid="post-image-viewer-close"
          >
            ✕
          </button>
          <span className="tabular-nums text-[15px] font-medium text-white/90" data-testid="post-image-viewer-counter">
            {safeIndex + 1} / {count}
          </span>
          <button
            type="button"
            aria-pressed={showOriginal}
            onClick={toggleOriginal}
            className={`rounded-full px-3 py-2 text-[14px] font-medium active:bg-white/15 ${showOriginal ? "bg-white/20 text-white" : "text-white/90"}`}
          >
            {t("cm_ui_original")}
          </button>
        </div>

        {count > 1 ? (
          <div className="pointer-events-none flex items-center justify-between px-1">
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={() => goTo(-1)}
              className="pointer-events-auto hidden h-11 w-11 items-center justify-center rounded-full bg-black/40 text-[24px] text-white disabled:opacity-25 [@media(pointer:fine)]:flex"
              aria-label={t("tier1_back")}
            >
              ‹
            </button>
            <button
              type="button"
              disabled={safeIndex >= count - 1}
              onClick={() => goTo(1)}
              className="pointer-events-auto hidden h-11 w-11 items-center justify-center rounded-full bg-black/40 text-[24px] text-white disabled:opacity-25 [@media(pointer:fine)]:flex"
              aria-label={t("common_next")}
            >
              ›
            </button>
          </div>
        ) : null}

        <div className="pointer-events-auto flex min-h-[52px] items-center justify-center bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
          {saveMode !== "none" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void runSave()}
              className="rounded-full bg-white/15 px-5 py-2 text-[14px] font-medium text-white active:bg-white/25 disabled:opacity-50"
            >
              {saving ? t("cm_ui_photo_saving") : t("cm_ui_photo_save")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

/** One viewer per post body: `openAt(urls, i)` from any image in that body. */
export function usePostImageViewer(options?: { displayUrlFor?: (url: string) => string }) {
  const [state, setState] = useState<{ urls: string[]; index: number } | null>(null);
  const openAt = useCallback((urls: string[], index: number) => {
    if (urls.length) setState({ urls, index: Math.max(0, Math.min(urls.length - 1, index)) });
  }, []);
  const close = useCallback(() => setState(null), []);
  const viewer = (
    <PostImageViewer
      open={state !== null}
      urls={state?.urls ?? []}
      index={state?.index ?? 0}
      onClose={close}
      displayUrlFor={options?.displayUrlFor}
    />
  );
  return { openAt, viewer };
}
