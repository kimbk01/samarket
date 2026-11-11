"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayConfirmDialog, DibayOverlayActions } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimBoardDto, MoimDetailDto } from "@/lib/moim/moim-api-types";
import { MOIM_ROLES, type MoimRole } from "@/lib/moim/moim-permission-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MoimManageFrame, moimManageCardClass, moimManageInputClass, moimRoleKey, useMoimManageToast } from "./moim-manage-shared";

const NAME_MAX = 30;
const ROLES_LOW_TO_HIGH: MoimRole[] = [...MOIM_ROLES].reverse();

type Sheet = { kind: "add" } | { kind: "rename"; board: MoimBoardDto } | { kind: "role"; board: MoimBoardDto } | null;

function BoardsBody({ detail, reload }: { detail: MoimDetailDto; reload: () => void }) {
  const { t } = useI18n();
  const toast = useMoimManageToast();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<MoimRole>("member");
  const [busy, setBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<MoimBoardDto | null>(null);

  const boardName = (b: MoimBoardDto) => (b.kind === "custom" ? b.name ?? "" : t(`moim_board_${b.kind}` as MessageKey));
  const boards = [...detail.boards].filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const submit = async (input: Parameters<typeof moimApi.saveBoard>[1], successKey: MessageKey) => {
    setBusy(true);
    const r = await moimApi.saveBoard(detail.id, input);
    setBusy(false);
    if (!r.ok) {
      toast.showError(r.error);
      return false;
    }
    toast.show(t(successKey), "success");
    reload();
    return true;
  };

  const onSave = async () => {
    if (!sheet) return;
    if (sheet.kind === "add") {
      const n = name.trim();
      if (!n || n.length > NAME_MAX) return toast.showError("moim_board_name_invalid");
      if (await submit({ name: n, writeMinRole: role }, "moim_manage_board_saved_toast")) setSheet(null);
    } else if (sheet.kind === "rename") {
      const n = name.trim();
      if (!n || n.length > NAME_MAX) return toast.showError("moim_board_name_invalid");
      if (await submit({ boardId: sheet.board.id, name: n }, "moim_manage_board_saved_toast")) setSheet(null);
    } else if (await submit({ boardId: sheet.board.id, writeMinRole: role }, "moim_manage_board_saved_toast")) {
      setSheet(null);
    }
  };

  const sheetTitle: MessageKey =
    sheet?.kind === "add" ? "moim_manage_board_add_title" : sheet?.kind === "rename" ? "moim_manage_board_rename_title" : "moim_manage_board_role_title";

  const roleChips = (
    <div className="-mx-1 mt-2 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup">
      {ROLES_LOW_TO_HIGH.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={role === r}
          className={`${role === r ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} shrink-0 whitespace-nowrap rounded-ui-rect`}
          onClick={() => setRole(r)}
        >
          {t("moim_manage_perm_role_or_above_chip", { role: t(moimRoleKey(r)) })}
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-4 pb-6 pt-4">
      <ul className={`${moimManageCardClass} divide-y divide-sam-border-soft`}>
        {boards.map((b) => (
          <li key={b.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="break-all text-[15px] font-medium text-sam-fg">{boardName(b)}</span>
              {b.kind !== "custom" ? <span className={`${Sam.badge.neutral} whitespace-nowrap`}>{t("moim_manage_board_system_badge")}</span> : null}
            </div>
            <p className="mt-0.5 text-[12px] text-sam-meta">{t("moim_manage_board_write_role", { role: t(moimRoleKey(b.writeMinRole)) })}</p>
            {b.kind === "notice" ? (
              <p className="mt-0.5 text-[12px] text-sam-meta">{t("moim_manage_board_notice_fixed")}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} rounded-ui-rect`}
                  onClick={() => {
                    setRole(b.writeMinRole);
                    setSheet({ kind: "role", board: b });
                  }}
                >
                  {t("moim_manage_board_role_btn")}
                </button>
                {b.kind === "custom" ? (
                  <>
                    <button
                      type="button"
                      className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} rounded-ui-rect`}
                      onClick={() => {
                        setName(b.name ?? "");
                        setSheet({ kind: "rename", board: b });
                      }}
                    >
                      {t("moim_manage_board_rename_btn")}
                    </button>
                    <button type="button" className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} rounded-ui-rect text-sam-danger`} onClick={() => setDeactivateTarget(b)}>
                      {t("moim_manage_board_deactivate_btn")}
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${Sam.btn.outlinePrimaryCombo} ${Sam.btn.block} mt-4 rounded-ui-rect`}
        onClick={() => {
          setName("");
          setRole("member");
          setSheet({ kind: "add" });
        }}
      >
        {t("moim_manage_board_add_btn")}
      </button>

      <DibayBottomSheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={t(sheetTitle)}
        footer={
          <DibayOverlayActions
            actions={[
              { key: "cancel", label: t("moim_manage_cancel_btn"), roleTone: "secondary", onClick: () => setSheet(null) },
              { key: "save", label: t("moim_manage_save_btn"), roleTone: "primary", loading: busy, onClick: () => void onSave() },
            ]}
          />
        }
      >
        {sheet?.kind === "add" || sheet?.kind === "rename" ? (
          <>
            <label className="block text-[13px] font-medium text-sam-muted" htmlFor="moim-board-name">
              {t("moim_manage_board_name_label")}
            </label>
            <input id="moim-board-name" className={`${moimManageInputClass} mt-1.5`} maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-right text-[12px] text-sam-meta">{t("moim_manage_char_count", { count: name.trim().length, max: NAME_MAX })}</p>
          </>
        ) : null}
        {sheet?.kind === "add" || sheet?.kind === "role" ? (
          <div className="mt-3">
            <p className="text-[13px] font-medium text-sam-muted">{t("moim_manage_board_write_role_label")}</p>
            {roleChips}
          </div>
        ) : null}
      </DibayBottomSheet>

      <DibayConfirmDialog
        open={deactivateTarget != null}
        title={t("moim_manage_board_deactivate_confirm_title", { name: deactivateTarget ? boardName(deactivateTarget) : "" })}
        description={t("moim_manage_board_deactivate_confirm_body")}
        cancelLabel={t("moim_manage_cancel_btn")}
        confirmLabel={t("moim_manage_board_deactivate_btn")}
        confirmTone="destructive"
        busy={busy}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => {
          const b = deactivateTarget;
          if (!b) return;
          void submit({ boardId: b.id, isActive: false }, "moim_manage_board_deactivated_toast").then((ok) => {
            if (ok) setDeactivateTarget(null);
          });
        }}
      />
      {toast.node}
    </div>
  );
}

export function MoimManageBoards({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_boards_title" allow={(d) => d.can.manage_boards}>
      {({ detail, reload }) => <BoardsBody detail={detail} reload={reload} />}
    </MoimManageFrame>
  );
}
