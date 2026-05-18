"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import { useState } from "react";
import type { BoardPointPolicy, PointRewardType } from "@/lib/types/point-policy";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";

interface BoardPointPolicyFormProps {
  initial?: BoardPointPolicy | null;
  onSubmit: (values: Partial<BoardPointPolicy>) => void;
  onCancel?: () => void;
}

const DEFAULT: Partial<BoardPointPolicy> = {
  boardKey: "general",
  boardName: "general",
  isActive: true,
  writeRewardType: "fixed",
  writeFixedPoint: 5,
  writeRandomMin: 0,
  writeRandomMax: 10,
  writeCooldownSeconds: 60,
  commentRewardType: "fixed",
  commentFixedPoint: 2,
  commentRandomMin: 0,
  commentRandomMax: 5,
  commentCooldownSeconds: 30,
  likeRewardPoint: 0,
  reportRewardPoint: 0,
  maxFreeUserPointCap: 500,
  eventMultiplierEnabled: true,
  adminMemo: "",
};

export function BoardPointPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: BoardPointPolicyFormProps) {
  const { t } = useI18n();

  const [values, setValues] = useState<Partial<BoardPointPolicy>>({
    ...DEFAULT,
    ...initial,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const setBoard = (key: string) => {
    const board = BOARD_OPTIONS.find((b) => b.key === key);
    setValues((v) => ({
      ...v,
      boardKey: key,
      boardName: pointBoardLabel(t, key),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial?.id && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_th_board")}
          </label>
          <select
            value={values.boardKey ?? ""}
            onChange={(e) => setBoard(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {BOARD_OPTIONS.map((b) => (
              <option key={b.key} value={b.key}>
                {pointBoardLabel(t, b.key)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_write_reward_type")}
        </label>
        <select
          value={values.writeRewardType ?? "fixed"}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              writeRewardType: e.target.value as PointRewardType,
            }))
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="fixed">{pointRewardTypeLabel(t, "fixed")}</option>
          <option value="random">{pointRewardTypeLabel(t, "random")}</option>
        </select>
      </div>
      {values.writeRewardType === "fixed" ? (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_write_fixed")}
          </label>
          <input
            type="number"
            min={0}
            value={values.writeFixedPoint ?? 0}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                writeFixedPoint: parseInt(e.target.value, 10) || 0,
              }))
            }
            className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_write_min")}
            </label>
            <input
              type="number"
              min={0}
              value={values.writeRandomMin ?? 0}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  writeRandomMin: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_write_max")}
            </label>
            <input
              type="number"
              min={0}
              value={values.writeRandomMax ?? 0}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  writeRandomMax: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_write_cooldown")}
        </label>
        <input
          type="number"
          min={0}
          value={values.writeCooldownSeconds ?? 0}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              writeCooldownSeconds: parseInt(e.target.value, 10) || 0,
            }))
          }
          className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_comment_reward_type")}
        </label>
        <select
          value={values.commentRewardType ?? "fixed"}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              commentRewardType: e.target.value as PointRewardType,
            }))
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="fixed">{pointRewardTypeLabel(t, "fixed")}</option>
          <option value="random">{pointRewardTypeLabel(t, "random")}</option>
        </select>
      </div>
      {values.commentRewardType === "fixed" ? (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_comment_fixed")}
          </label>
          <input
            type="number"
            min={0}
            value={values.commentFixedPoint ?? 0}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                commentFixedPoint: parseInt(e.target.value, 10) || 0,
              }))
            }
            className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_comment_min")}
            </label>
            <input
              type="number"
              min={0}
              value={values.commentRandomMin ?? 0}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  commentRandomMin: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_comment_max")}
            </label>
            <input
              type="number"
              min={0}
              value={values.commentRandomMax ?? 0}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  commentRandomMax: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_comment_cooldown")}
        </label>
        <input
          type="number"
          min={0}
          value={values.commentCooldownSeconds ?? 0}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              commentCooldownSeconds: parseInt(e.target.value, 10) || 0,
            }))
          }
          className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_free_cap")}
        </label>
        <input
          type="number"
          min={0}
          value={values.maxFreeUserPointCap ?? 0}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              maxFreeUserPointCap: parseInt(e.target.value, 10) || 0,
            }))
          }
          className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="eventMultiplier"
          checked={values.eventMultiplierEnabled ?? false}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              eventMultiplierEnabled: e.target.checked,
            }))
          }
          className="rounded border-sam-border"
        />
        <label htmlFor="eventMultiplier" className="sam-text-body text-sam-fg"> {t("admin_points_policy_label_event_multiplier")}
        </label>
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_label_admin_memo")}
        </label>
        <textarea
          value={values.adminMemo ?? ""}
          onChange={(e) =>
            setValues((v) => ({ ...v, adminMemo: e.target.value }))
          }
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
