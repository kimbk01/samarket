"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import {
  loadTradeFrequentPhrases,
  saveTradeFrequentPhrases,
} from "@/lib/posts/trade-frequent-phrases-storage";

const ENTER_MS = 320;
const EXIT_MS = 520;

/**
 * 당근형 — 자주 쓰는 문구 바텀시트 (슬라이드 인·아웃 · 배경 투명 · 목록 · 추가 · 수정 · 삭제)
 */
export function TradeFrequentPhrasesSheet({
  open,
  onClose,
  onPickPhrase,
}: {
  open: boolean;
  onClose: () => void;
  onPickPhrase: (text: string) => void;
}) {
  const titleId = useId();
  const closingRef = useRef(false);
  const finalizedRef = useRef(false);
  const exitFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 포털 유지 (닫힘 애니메이션 동안) */
  const [present, setPresent] = useState(false);
  const [entered, setEntered] = useState(false);

  const [phrases, setPhrases] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const persist = useCallback((next: string[]) => {
    setPhrases(next);
    saveTradeFrequentPhrases(next);
  }, []);

  const cleanupTimers = () => {
    if (exitFallbackTimerRef.current) {
      clearTimeout(exitFallbackTimerRef.current);
      exitFallbackTimerRef.current = null;
    }
  };

  const finalizeExit = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    cleanupTimers();
    closingRef.current = false;
    setPresent(false);
    setEntered(false);
    setAdding(false);
    setDraft("");
    setEditingIndex(null);
    setEditDraft("");
    onClose();
  }, [onClose]);

  const startExitAnimation = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setEntered(false);
    cleanupTimers();
    exitFallbackTimerRef.current = setTimeout(() => {
      exitFallbackTimerRef.current = null;
      finalizeExit();
    }, EXIT_MS + 100);
  }, [finalizeExit]);

  /** 열림 */
  useLayoutEffect(() => {
    if (!open) return;
    finalizedRef.current = false;
    closingRef.current = false;
    cleanupTimers();
    setPresent(true);
    setEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  /** 부모가 바로 open=false 한 경우에도 슬라이드 다운 후 정리 */
  useLayoutEffect(() => {
    if (!open && present && entered && !closingRef.current) {
      startExitAnimation();
    }
  }, [open, present, entered, startExitAnimation]);

  useEffect(() => {
    if (!open || !present) return;
    setPhrases(loadTradeFrequentPhrases());
  }, [open, present]);

  const beginClose = useCallback(() => {
    startExitAnimation();
  }, [startExitAnimation]);

  useEffect(() => {
    if (!present || !entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") beginClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, entered, beginClose]);

  const handleAdd = () => {
    const t = draft.trim();
    if (!t) return;
    if (phrases.includes(t)) {
      setAdding(false);
      setDraft("");
      return;
    }
    persist([t, ...phrases]);
    setDraft("");
    setAdding(false);
  };

  const removeAt = (index: number) => {
    persist(phrases.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditDraft("");
    }
  };

  const startEdit = (index: number) => {
    setAdding(false);
    setDraft("");
    setEditingIndex(index);
    setEditDraft(phrases[index] ?? "");
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const t = editDraft.trim();
    if (!t) return;
    const next = [...phrases];
    const dup = next.findIndex((s, i) => s === t && i !== editingIndex);
    if (dup >= 0) {
      setEditingIndex(null);
      setEditDraft("");
      return;
    }
    next[editingIndex] = t;
    persist(next);
    setEditingIndex(null);
    setEditDraft("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft("");
  };

  const pick = (text: string) => {
    onPickPhrase(text);
    beginClose();
  };

  const onPanelTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (!closingRef.current) return;
    finalizeExit();
  };

  useEffect(() => () => cleanupTimers(), []);

  if (!present || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[205] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="닫기"
        onClick={beginClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          transitionDuration: entered ? `${ENTER_MS}ms` : `${EXIT_MS}ms`,
          transitionTimingFunction: entered
            ? "cubic-bezier(0.22, 1, 0.36, 1)"
            : "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        className={`relative max-h-[min(88vh,720px)] w-full overflow-hidden rounded-t-[14px] bg-sam-surface shadow-[0_-6px_28px_rgba(0,0,0,0.14)] transition-transform will-change-transform ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        onTransitionEnd={onPanelTransitionEnd}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="h-1 w-10 rounded-full bg-sam-border" aria-hidden />
        </div>

        <div className="flex items-center justify-between border-b border-sam-border-soft px-3 pb-2 pt-0.5">
          <h2 id={titleId} className="text-[13px] font-bold leading-tight text-sam-fg">
            자주 쓰는 문구
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditingIndex(null);
              setEditDraft("");
              setAdding((v) => !v);
              setDraft("");
            }}
            className="inline-flex items-center gap-0.5 rounded-ui-rect px-2 py-1 text-[11px] font-semibold text-signature"
          >
            <Plus className="h-3.5 w-3.5 text-current" aria-hidden />
            추가
          </button>
        </div>

        {adding ? (
          <div className="border-b border-sam-border-soft px-3 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="문구를 입력하세요"
              rows={3}
              maxLength={800}
              className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[11px] leading-snug text-sam-fg outline-none placeholder:text-sam-meta focus:border-sam-primary"
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
                className="rounded-ui-rect px-2 py-1 text-[11px] text-sam-muted"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!draft.trim()}
                className="rounded-ui-rect bg-signature px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        ) : null}

        <div className="max-h-[min(58vh,480px)] overflow-y-auto overscroll-y-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {phrases.length === 0 ? (
            <p className="px-4 py-10 text-center text-[11px] leading-relaxed text-sam-muted">
              자주 쓰는 문구를 등록해보세요.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {phrases.map((p, i) =>
                editingIndex === i ? (
                  <li
                    key={`edit-${i}`}
                    className="border-b border-sam-border/60 px-3 py-2 last:border-b-0"
                  >
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={4}
                      maxLength={800}
                      className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[11px] leading-snug text-sam-fg outline-none focus:border-sam-primary"
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-ui-rect px-2 py-1 text-[11px] text-sam-muted"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={!editDraft.trim()}
                        className="rounded-ui-rect bg-signature px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        저장
                      </button>
                    </div>
                  </li>
                ) : (
                  <li
                    key={`${i}-${p.slice(0, 24)}`}
                    className="flex items-start gap-1 border-b border-sam-border/60 px-2 py-1.5 last:border-b-0"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-ui-rect px-1 py-0.5 text-left text-[11px] leading-snug text-sam-fg hover:bg-sam-surface-muted"
                      onClick={() => pick(p)}
                    >
                      <span className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">{p}</span>
                    </button>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        className="rounded-ui-rect px-1.5 py-0.5 sam-text-xxs text-signature hover:bg-sam-surface-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(i);
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded-ui-rect px-1.5 py-0.5 sam-text-xxs text-sam-muted hover:bg-sam-surface-muted hover:text-sam-danger"
                        aria-label="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAt(i);
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
