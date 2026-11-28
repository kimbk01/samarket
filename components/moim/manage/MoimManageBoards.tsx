"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayConfirmDialog, DibayOverlayActions } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimBoardDto, MoimDetailDto } from "@/lib/moim/moim-api-types";
import { MOIM_ROLES, type MoimRole } from "@/lib/moim/moim-permission-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { moimCls } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";
import {
  MoimManageFrame,
  moimManageCardClass,
  moimManageSheetInputClass,
  moimRoleAtLeastLabel,
  useMoimManageToast,
} from "./moim-manage-shared";

const NAME_MAX = 30;
const ROLES_LOW_TO_HIGH: MoimRole[] = [...MOIM_ROLES].reverse();

/** R5 C4: 화면 안 순서에서 한 칸 옮기기 — 맨 위·맨 아래를 넘으면 그대로 */
export function moveMoimBoardOrder(order: readonly string[], id: string, dir: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 켜진 게시판(순서대로)·닫은 게시판 — 상세는 멤버에게 닫은 게시판까지 준다 (R5 C15) */
export function splitMoimBoards(boards: readonly MoimBoardDto[]): { active: MoimBoardDto[]; closed: MoimBoardDto[] } {
  const sorted = [...boards].sort((a, b) => a.sortOrder - b.sortOrder);
  return { active: sorted.filter((b) => b.isActive), closed: sorted.filter((b) => !b.isActive) };
}

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
  const { active: activeBoards, closed: closedBoards } = splitMoimBoards(detail.boards);
  /** R5 C4: 화면 안에서만 바꾼 순서 (null = 저장된 순서 그대로) */
  const [order, setOrder] = useState<string[] | null>(null);
  const savedOrder = activeBoards.map((b) => b.id);
  const viewOrder = order ?? savedOrder;
  const byId = new Map(activeBoards.map((b) => [b.id, b]));
  const boards = viewOrder.map((id) => byId.get(id)).filter((b): b is MoimBoardDto => !!b);
  const orderChanged = order != null && order.join(",") !== savedOrder.join(",");
  const move = (id: string, dir: -1 | 1) => setOrder(moveMoimBoardOrder(viewOrder, id, dir));
  const saveOrder = async () => {
    if (!order || busy) return;
    setBusy(true);
    const r = await moimApi.reorderBoards(detail.id, order);
    setBusy(false);
    if (!r.ok) {
      toast.showError(r.error);
      /** 다른 운영진이 그 사이 게시판을 바꿈 → 다시 불러온다 */
      if (r.error === "moim_board_order_invalid") {
        setOrder(null);
        reload();
      }
      return;
    }
    toast.show(t("moim_manage_board_order_saved_toast"), "success");
    setOrder(null);
    reload();
  };

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
          className={`${role === r ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} min-h-[length:var(--sam-tap-min)] shrink-0 whitespace-nowrap rounded-ui-rect`}
          onClick={() => setRole(r)}
        >
          {moimRoleAtLeastLabel(r, t)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-4 pb-6 pt-4">
      <ul className={`${moimManageCardClass} divide-y divide-sam-border-soft`}>
        {boards.map((b, i) => (
          <li key={b.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="break-all text-[15px] font-medium text-sam-fg">{boardName(b)}</span>
                {b.kind !== "custom" ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_manage_board_system_badge")}</span> : null}
              </div>
              {/* R5 C4: 순서 바꾸기 — 44px 버튼, 맨 위·맨 아래는 비활성 */}
              <div className="-my-2 -mr-2 flex shrink-0">
                <button
                  type="button"
                  className="grid h-[length:var(--sam-tap-min)] w-[length:var(--sam-tap-min)] place-items-center rounded-ui-rect text-sam-muted disabled:opacity-30"
                  aria-label={t("moim_manage_board_move_up_aria")}
                  disabled={busy || i === 0}
                  onClick={() => move(b.id, -1)}
                >
                  <ChevronUp className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="grid h-[length:var(--sam-tap-min)] w-[length:var(--sam-tap-min)] place-items-center rounded-ui-rect text-sam-muted disabled:opacity-30"
                  aria-label={t("moim_manage_board_move_down_aria")}
                  disabled={busy || i === boards.length - 1}
                  onClick={() => move(b.id, 1)}
                >
                  <ChevronDown className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-[12px] text-sam-meta">{moimRoleAtLeastLabel(b.writeMinRole, t, "board_write")}</p>
            {b.kind === "notice" ? (
              <p className="mt-0.5 text-[12px] text-sam-meta">{t("moim_manage_board_notice_fixed")}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${moimCls.btnSecondary} ${moimCls.btnSm}`}
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
                      className={`${moimCls.btnSecondary} ${moimCls.btnSm}`}
                      onClick={() => {
                        setName(b.name ?? "");
                        setSheet({ kind: "rename", board: b });
                      }}
                    >
                      {t("moim_manage_board_rename_btn")}
                    </button>
                    <button type="button" className={`${moimCls.btnDanger} ${moimCls.btnSm}`} onClick={() => setDeactivateTarget(b)}>
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
        className={`${moimCls.btnSecondary} ${moimCls.btnBlock} mt-4`}
        onClick={() => {
          setName("");
          setRole("member");
          setSheet({ kind: "add" });
        }}
      >
        {t("moim_manage_board_add_btn")}
      </button>

      {/* R5 C15: 닫은 게시판 — 다시 열기 (서버가 상한을 검사하고 맨 뒤로 둔다) */}
      {closedBoards.length > 0 ? (
        <>
          <h2 className="pb-2 pt-5 text-[13px] font-semibold text-sam-muted">{t("moim_manage_boards_closed_title")}</h2>
          <ul className={`${moimManageCardClass} divide-y divide-sam-border-soft`}>
            {closedBoards.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 break-all text-[15px] text-sam-muted">{boardName(b)}</span>
                <button
                  type="button"
                  disabled={busy}
                  className={`${moimCls.btnSecondary} ${moimCls.btnSm} shrink-0`}
                  onClick={() => void submit({ boardId: b.id, isActive: true }, "moim_manage_board_reopened_toast")}
                >
                  {t("moim_manage_board_reopen_btn")}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {orderChanged ? (
        <MoimStickyFooter className="-mx-4 mt-5">
          <div className={`${moimCls.column} flex gap-2`}>
            <button type="button" disabled={busy} className={`${moimCls.btnSecondary} flex-1`} onClick={() => setOrder(null)}>
              {t("moim_manage_board_order_reset_btn")}
            </button>
            <button type="button" disabled={busy} className={`${moimCls.btnPrimary} flex-1`} onClick={() => void saveOrder()}>
              {t("moim_manage_board_order_save_btn")}
            </button>
          </div>
        </MoimStickyFooter>
      ) : null}

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
            <input id="moim-board-name" className={`${moimManageSheetInputClass} mt-1.5`} maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
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
