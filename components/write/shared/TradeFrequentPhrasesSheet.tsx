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

  const textareaClass = `${OverlayUi.input} !mt-0 resize-none py-2`;
  const actionsClass = `${OverlayUi.actionsRow} !mt-2`;

  return (
    <DibayBottomSheet
      open={open}
      onClose={handleClose}
      showHandle
      ariaLabel={t("trade_write_frequent_phrases_title")}
    >
      <div className="flex items-center justify-between border-b border-[color:var(--overlay-border)] pb-2">
        <h2 className={`${OverlayUi.title} ${OverlayUi.titleSheet} !text-left`}>
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
          className={OverlayUi.textAction}
        >
          <Plus className="h-4 w-4 text-current" aria-hidden />
          {t("trade_write_frequent_phrases_add")}
        </button>
      </div>

      {adding ? (
        <div className="border-b border-[color:var(--overlay-border)] py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("ui_write_phrase_ph")}
            rows={3}
            maxLength={800}
            className={`${textareaClass} placeholder:text-[color:var(--overlay-text-secondary)]`}
          />
          <div className={actionsClass}>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className={OverlayUi.btn.secondary}
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!draft.trim()}
              className={OverlayUi.btn.primary}
            >
              {t("trade_write_frequent_phrases_save")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-[min(58vh,480px)] overflow-y-auto overscroll-y-contain">
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
                  className="border-b border-[color:var(--overlay-border)] py-3 last:border-b-0"
                >
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    maxLength={800}
                    className={textareaClass}
                  />
                  <div className={actionsClass}>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className={OverlayUi.btn.secondary}
                    >
                      {t("common_cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editDraft.trim()}
                      className={OverlayUi.btn.primary}
                    >
                      {t("trade_write_frequent_phrases_save")}
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={`${i}-${p.slice(0, 24)}`}
                  className="flex items-center gap-1 border-b border-[color:var(--overlay-border)] last:border-b-0"
                >
                  <button
                    type="button"
                    className={`${OverlayUi.popoverItem} min-w-0 flex-1 !px-1 py-2`}
                    onClick={() => pick(p)}
                  >
                    <span className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words">{p}</span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      className={OverlayUi.textAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(i);
                      }}
                    >
                      {t("trade_write_frequent_phrases_edit")}
                    </button>
                    <button
                      type="button"
                      className={OverlayUi.textActionMuted}
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
