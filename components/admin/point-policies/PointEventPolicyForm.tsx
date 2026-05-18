"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import type { PointEventPolicy } from "@/lib/types/point-policy";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";

interface PointEventPolicyFormProps {
  initial?: Partial<PointEventPolicy> | null;
  onSubmit: (values: Partial<PointEventPolicy>) => void;
  onCancel?: () => void;
}

export function PointEventPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: PointEventPolicyFormProps) {
  const { t } = useI18n();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [startAt, setStartAt] = useState(
    initial?.startAt
      ? new Date(initial.startAt).toISOString().slice(0, 16)
      : ""
  );
  const [endAt, setEndAt] = useState(
    initial?.endAt ? new Date(initial.endAt).toISOString().slice(0, 16) : ""
  );
  const [writeMultiplier, setWriteMultiplier] = useState(
    initial?.writeMultiplier ?? 1.5
  );
  const [commentMultiplier, setCommentMultiplier] = useState(
    initial?.commentMultiplier ?? 1.2
  );
  const [targetBoards, setTargetBoards] = useState<string[]>(
    initial?.targetBoards ?? ["general"]
  );
  const [note, setNote] = useState(initial?.note ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      isActive,
      startAt: startAt ? new Date(startAt).toISOString() : "",
      endAt: endAt ? new Date(endAt).toISOString() : "",
      writeMultiplier,
      commentMultiplier,
      targetBoards,
      note,
    });
  };

  const toggleBoard = (key: string) => {
    setTargetBoards((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_title")}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          placeholder={t("admin_points_policy_event_title_ph")}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="evActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="evActive" className="sam-text-body text-sam-fg"> {t("admin_points_status_active")}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_start")}
          </label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_end")}
          </label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_write_mult")}
          </label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={writeMultiplier}
            onChange={(e) =>
              setWriteMultiplier(parseFloat(e.target.value) || 1)
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_comment_mult")}
          </label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={commentMultiplier}
            onChange={(e) =>
              setCommentMultiplier(parseFloat(e.target.value) || 1)
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_th_target_boards")}
        </label>
        <div className="flex flex-wrap gap-2">
          {BOARD_OPTIONS.map((b) => (
            <label key={b.key} className="flex items-center gap-1 sam-text-body">
              <input
                type="checkbox"
                checked={targetBoards.includes(b.key)}
                onChange={() => toggleBoard(b.key)}
                className="rounded border-sam-border"
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_event_note")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("common_save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
          > {t("admin_points_charge_status_cancelled")}
          </button>
        )}
      </div>
    </form>
  );
}
