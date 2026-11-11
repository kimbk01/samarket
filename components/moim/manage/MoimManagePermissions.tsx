"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import {
  MOIM_ACTIONS,
  MOIM_PERMISSION_DEFAULTS,
  MOIM_ROLES,
  isAllowedMoimPermissionOverride,
  type MoimAction,
  type MoimRole,
} from "@/lib/moim/moim-permission-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MoimManageFrame, moimManageCardClass, moimManageSectionTitleClass, moimRoleKey, useMoimManageToast } from "./moim-manage-shared";

/** 낮은 역할부터 (멤버 → 모임장) */
const ROLES_LOW_TO_HIGH: MoimRole[] = [...MOIM_ROLES].reverse();

function effectiveRole(detail: MoimDetailDto, action: MoimAction): MoimRole {
  const rule = MOIM_PERMISSION_DEFAULTS[action];
  return (rule.adjustable ? detail.permissionOverrides[action] : undefined) ?? rule.defaultMinRole;
}

function PermissionsBody({ detail, reload }: { detail: MoimDetailDto; reload: () => void }) {
  const { t } = useI18n();
  const toast = useMoimManageToast();
  const adjustable = MOIM_ACTIONS.filter((a) => MOIM_PERMISSION_DEFAULTS[a].adjustable);
  const fixed = MOIM_ACTIONS.filter((a) => !MOIM_PERMISSION_DEFAULTS[a].adjustable);
  const initial = useMemo(() => {
    const m = {} as Record<MoimAction, MoimRole>;
    for (const a of MOIM_ACTIONS) m[a] = effectiveRole(detail, a);
    return m;
  }, [detail]);
  const [draft, setDraft] = useState<Record<MoimAction, MoimRole>>(initial);
  const [busy, setBusy] = useState(false);
  const changed = adjustable.filter((a) => draft[a] !== initial[a]);

  const save = async () => {
    const overrides: Partial<Record<MoimAction, MoimRole>> = {};
    for (const a of changed) overrides[a] = draft[a];
    setBusy(true);
    const r = await moimApi.setPermissions(detail.id, overrides);
    setBusy(false);
    if (!r.ok) {
      toast.showError(r.error);
      return;
    }
    toast.show(t("moim_manage_perm_saved_toast"), "success");
    reload();
  };

  return (
    <div className="pb-6">
      <p className="px-4 pt-4 text-[13px] text-sam-muted">{t("moim_manage_perm_intro")}</p>

      <h2 className={moimManageSectionTitleClass}>{t("moim_manage_perm_adjustable_title")}</h2>
      <ul className={`${moimManageCardClass} mx-4 divide-y divide-sam-border-soft`}>
        {adjustable.map((action) => {
          const options = ROLES_LOW_TO_HIGH.filter((r) => isAllowedMoimPermissionOverride(action, r));
          return (
            <li key={action} className="px-4 py-3">
              <p className="text-[15px] font-medium text-sam-fg">{t(`moim_perm_${action}` as MessageKey)}</p>
              <div className="-mx-1 mt-2 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup">
                {options.map((role) => {
                  const on = draft[action] === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`${on ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} shrink-0 whitespace-nowrap rounded-ui-rect`}
                      onClick={() => setDraft((d) => ({ ...d, [action]: role }))}
                    >
                      {t("moim_manage_perm_role_or_above_chip", { role: t(moimRoleKey(role)) })}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className={moimManageSectionTitleClass}>{t("moim_manage_perm_fixed_title")}</h2>
      <ul className={`${moimManageCardClass} mx-4 divide-y divide-sam-border-soft`}>
        {fixed.map((action) => (
          <li key={action} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 text-[15px] text-sam-fg">{t(`moim_perm_${action}` as MessageKey)}</span>
            <span className="shrink-0 whitespace-nowrap text-[13px] text-sam-muted">
              {t("moim_manage_perm_role_or_above_chip", { role: t(moimRoleKey(initial[action])) })}
            </span>
          </li>
        ))}
      </ul>

      <div className="px-4 pt-5">
        <button
          type="button"
          disabled={busy || changed.length === 0}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.btn.disabledToken} rounded-ui-rect`}
          onClick={() => void save()}
        >
          {t("moim_manage_save_btn")}
        </button>
      </div>
      {toast.node}
    </div>
  );
}

export function MoimManagePermissions({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_permissions_title" allow={(d) => d.can.edit_info}>
      {({ detail, reload }) => <PermissionsBody key={detail.updatedAt + JSON.stringify(detail.permissionOverrides)} detail={detail} reload={reload} />}
    </MoimManageFrame>
  );
}
