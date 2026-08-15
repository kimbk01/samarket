"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  loadTradeFrequentPhrases,
  saveTradeFrequentPhrases,
} from "@/lib/posts/trade-frequent-phrases-storage";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/**
 * 자주 쓰는 문구 바텀시트 — DibayBottomSheet SSOT; 목록 · 추가 · 수정 · 삭제.
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
  const { t } = useI18n();
  const [phrases, setPhrases] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const persist = useCallback((next: string[]) => {
    setPhrases(next);
    saveTradeFrequentPhrases(next);
  }, []);

  const resetLocal = useCallback(() => {
    setAdding(false);
    setDraft("");
    setEditingIndex(null);
    setEditDraft("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetLocal();
      return;
    }
    setPhrases(loadTradeFrequentPhrases());
  }, [open, resetLocal]);

  const handleClose = useCallback(() => {
    resetLocal();
    onClose();
  }, [onClose, resetLocal]);

  const handleAdd = () => {
    const next = draft.trim();
    if (!next) return;
    if (phrases.includes(next)) {
      setAdding(false);
      setDraft("");
      return;
    }
    persist([next, ...phrases]);
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
    const nextText = editDraft.trim();
    if (!nextText) return;
    const next = [...phrases];
    const dup = next.findIndex((s, i) => s === nextText && i !== editingIndex);
    if (dup >= 0) {
      setEditingIndex(null);
      setEditDraft("");
      return;
    }
    next[editingIndex] = nextText;
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
    handleClose();
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={handleClose}
      showHandle
      ariaLabel={t("trade_write_frequent_phrases_title")}
      panelClassName="!p-0"
      anchor="device-bottom"
    >
      <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] px-3 pb-2 pt-0.5">
        <h2 className={`${OverlayUi.title} ${OverlayUi.titleSheet} !text-left text-[13px]`}>
          {t("trade_write_frequent_phrases_title")}
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditingIndex(null);
            setEditDraft("");
            setAdding((v) => !v);
            setDraft("");
          }}
          className="inline-flex items-center gap-0.5 rounded-[length:var(--overlay-radius-sm)] px-2 py-1 text-[11px] font-semibold text-[color:var(--overlay-primary)]"
        >
          <Plus className="h-3.5 w-3.5 text-current" aria-hidden />
          {t("trade_write_frequent_phrases_add")}
        </button>
      </div>

      {adding ? (
        <div className="border-b border-[color:var(--overlay-border)] px-3 py-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("ui_write_phrase_ph")}
            rows={3}
            maxLength={800}
            className="w-full resize-none rounded-[length:var(--overlay-radius-sm)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-2 py-1.5 text-[11px] leading-snug text-[color:var(--overlay-text-primary)] outline-none placeholder:text-[color:var(--overlay-text-secondary)]"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="rounded-[length:var(--overlay-radius-sm)] px-2 py-1 text-[11px] text-[color:var(--overlay-text-secondary)]"
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim()}
              className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-primary)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {t("trade_write_frequent_phrases_save")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-[min(58vh,480px)] overflow-y-auto overscroll-y-contain pb-[max(0.75rem,var(--safe-bottom))]">
        {phrases.length === 0 ? (
          <p className={`px-4 py-10 text-center ${OverlayUi.caption}`}>
            {t("trade_write_frequent_phrases_empty")}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {phrases.map((p, i) =>
              editingIndex === i ? (
                <li
                  key={`edit-${i}`}
                  className="border-b border-[color:var(--overlay-border)] px-3 py-2 last:border-b-0"
                >
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    maxLength={800}
                    className="w-full resize-none rounded-[length:var(--overlay-radius-sm)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-2 py-1.5 text-[11px] leading-snug text-[color:var(--overlay-text-primary)] outline-none"
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-[length:var(--overlay-radius-sm)] px-2 py-1 text-[11px] text-[color:var(--overlay-text-secondary)]"
                    >
                      {t("common_cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editDraft.trim()}
                      className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-primary)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      {t("trade_write_frequent_phrases_save")}
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={`${i}-${p.slice(0, 24)}`}
                  className="flex items-start gap-1 border-b border-[color:var(--overlay-border)] px-2 py-1.5 last:border-b-0"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-[length:var(--overlay-radius-sm)] px-1 py-0.5 text-left text-[11px] leading-snug text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-secondary)]"
                    onClick={() => pick(p)}
                  >
                    <span className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">{p}</span>
                  </button>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      className="rounded-[length:var(--overlay-radius-sm)] px-1.5 py-0.5 text-[10px] text-[color:var(--overlay-primary)] hover:bg-[color:var(--overlay-secondary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(i);
                      }}
                    >
                      {t("trade_write_frequent_phrases_edit")}
                    </button>
                    <button
                      type="button"
                      className="rounded-[length:var(--overlay-radius-sm)] px-1.5 py-0.5 text-[10px] text-[color:var(--overlay-text-secondary)] hover:bg-[color:var(--overlay-secondary)] hover:text-[color:var(--overlay-danger)]"
                      aria-label={t("common_delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAt(i);
                      }}
                    >
                      {t("trade_write_frequent_phrases_delete")}
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </DibayBottomSheet>
  );
}
