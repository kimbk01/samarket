"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BOTTOM_NAV_ICON_LABEL_KEYS } from "@/components/admin/i18n/admin-menus-label-keys";
import { MainBottomNavTabIcon, mainBottomNavIconLabel } from "@/components/main-menu/MainBottomNavTabIcon";
import { ADMIN_MAIN_BOTTOM_NAV_ICON_OPTIONS } from "@/lib/main-menu/admin-main-bottom-nav-icon-options";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import {
  iconDraftFromRow,
  iconDraftToApplyPatch,
  iconDraftToTabValue,
  type MainBottomNavIconApplyPatch,
  type MainBottomNavIconDraft,
} from "@/lib/main-menu/main-bottom-nav-admin-edit";
import {
  filterLucideBottomNavIcons,
  LUCIDE_BOTTOM_NAV_ICON_LIBRARY_URL,
  resolveLucideBottomNavIcon,
  type LucideBottomNavIconCategory,
} from "@/lib/main-menu/lucide-bottom-nav-icon-registry";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

export type MainBottomNavIconPickerValue = {
  icon: BottomNavIconKey;
  lucideIcon?: string;
};

const LUCIDE_CATEGORY_KEYS: LucideBottomNavIconCategory[] = [
  "all",
  "nav",
  "commerce",
  "communication",
  "user",
  "media",
  "misc",
];

interface MainBottomNavIconPickerModalProps {
  menuLabel: string;
  value: MainBottomNavIconPickerValue;
  onApply: (patch: MainBottomNavIconApplyPatch) => void;
  onClose: () => void;
  disabled?: boolean;
}

function isDraftEqual(a: MainBottomNavIconDraft, b: MainBottomNavIconDraft): boolean {
  return (
    a.source === b.source &&
    a.icon === b.icon &&
    (a.lucideIcon ?? null) === (b.lucideIcon ?? null)
  );
}

/** Lucide 아이콘 선택 — 드래프트 후 [적용]으로 확정 */
export function MainBottomNavIconPickerModal({
  menuLabel,
  value,
  onApply,
  onClose,
  disabled = false,
}: MainBottomNavIconPickerModalProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LucideBottomNavIconCategory>("all");
  const [tab, setTab] = useState<"lucide" | "builtin">(() =>
    value.lucideIcon ? "lucide" : "builtin"
  );

  const committedDraft = useMemo(() => iconDraftFromRow(value), [value]);
  const [draft, setDraft] = useState<MainBottomNavIconDraft>(committedDraft);

  useEffect(() => {
    setDraft(iconDraftFromRow(value));
    setTab(value.lucideIcon ? "lucide" : "builtin");
    setQuery("");
    setCategory("all");
  }, [value]);

  const lucideIcons = useMemo(() => filterLucideBottomNavIcons(query, category), [query, category]);
  const draftPreview = iconDraftToTabValue(draft);
  const draftChanged = !isDraftEqual(draft, committedDraft);

  const handleApply = () => {
    onApply(iconDraftToApplyPatch(draft));
    onClose();
  };

  return (
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="nested">
      <div
        className={`${OverlayUi.dialogPanel} !max-w-2xl flex max-h-[88vh] w-full flex-col overflow-hidden !p-0`}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="main-bottom-nav-icon-picker-title"
      >
        <div className="border-b border-[color:var(--overlay-border)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="main-bottom-nav-icon-picker-title" className={OverlayUi.title}>
                {t("admin_menu_bottom_icon_picker_title")}
              </h2>
              <p className={`mt-0.5 ${OverlayUi.caption}`}>
                {t("admin_menu_bottom_icon_picker_desc", { name: menuLabel })}
              </p>
            </div>
            <DibayOverlayButton
              roleTone="text"
              onClick={onClose}
              className="!min-h-9 !w-9 !flex-none !p-0"
              aria-label={t("admin_menu_close_aria")}
            >
              ✕
            </DibayOverlayButton>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-surface text-signature ring-1 ring-sam-border">
              <MainBottomNavTabIcon tab={draftPreview} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="sam-text-xxs font-medium text-sam-fg">
                {draftChanged ? t("admin_menu_bottom_icon_preview") : t("admin_menu_bottom_icon_current")}
              </p>
              <p className="sam-text-xxs text-sam-muted">{mainBottomNavIconLabel(draftPreview)}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-1">
            <AdminChipButton selected={tab === "lucide"} disabled={disabled} onClick={() => setTab("lucide")}>
              Lucide
            </AdminChipButton>
            <AdminChipButton selected={tab === "builtin"} disabled={disabled} onClick={() => setTab("builtin")}>
              {t("admin_menu_bottom_icon_builtin_heading")}
            </AdminChipButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === "lucide" ? (
            <>
              <div className="mb-2 flex flex-wrap gap-1">
                {LUCIDE_CATEGORY_KEYS.map((key) => (
                  <AdminChipButton key={key} selected={category === key} disabled={disabled} onClick={() => setCategory(key)}>
                    {t(
                      key === "all"
                        ? "admin_menu_bottom_icon_cat_all"
                        : (`admin_menu_bottom_icon_cat_${key}` as "admin_menu_bottom_icon_cat_nav")
                    )}
                  </AdminChipButton>
                ))}
              </div>

              <input
                type="search"
                value={query}
                disabled={disabled}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("admin_menu_bottom_icon_search_ph")}
                className="w-full rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper"
              />

              <p className="mt-2 sam-text-xxs text-sam-muted">
                {t("admin_menu_bottom_icon_lucide_credit")}{" "}
                <a
                  href={LUCIDE_BOTTOM_NAV_ICON_LIBRARY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-signature hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  lucide.dev
                </a>
              </p>

              {lucideIcons.length === 0 ? (
                <p className="py-6 text-center sam-text-helper text-sam-muted">{t("admin_menu_bottom_icon_empty")}</p>
              ) : (
                <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
                  {lucideIcons.map((entry) => {
                    const selected = draft.source === "lucide" && draft.lucideIcon === entry.name;
                    const LucideIcon = resolveLucideBottomNavIcon(entry.name);
                    if (!LucideIcon) return null;
                    return (
                      <AdminActionButton
                        key={entry.name}
                        variant="neutral"
                        size="sm"
                        disabled={disabled}
                        title={entry.name}
                        aria-pressed={selected}
                        onClick={() =>
                          setDraft({ source: "lucide", icon: draft.icon, lucideIcon: entry.name })
                        }
                        className={`!h-auto !flex-col !gap-0.5 !px-1 py-1.5 font-normal ${
                          selected ? "!border-signature bg-signature/5 ring-1 ring-signature/30" : "!border-transparent"
                        }`}
                      >
                        <LucideIcon className="h-5 w-5 text-sam-fg" />
                        <span className="line-clamp-1 w-full text-center sam-text-xxs leading-none text-sam-muted">
                          {entry.name}
                        </span>
                      </AdminActionButton>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {ADMIN_MAIN_BOTTOM_NAV_ICON_OPTIONS.map((iconKey) => {
                const selected = draft.source === "builtin" && draft.icon === iconKey;
                return (
                  <AdminActionButton
                    key={iconKey}
                    variant="neutral"
                    size="sm"
                    disabled={disabled}
                    title={t(BOTTOM_NAV_ICON_LABEL_KEYS[iconKey])}
                    aria-pressed={selected}
                    onClick={() => setDraft({ source: "builtin", icon: iconKey })}
                    className={`!h-auto !flex-col !whitespace-normal py-2.5 font-normal ${
                      selected ? "!border-signature bg-signature/5 ring-1 ring-signature/30" : ""
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sam-border-soft text-sam-fg">
                      <MainBottomNavTabIcon tab={{ icon: iconKey }} className="h-5 w-5" />
                    </span>
                    <span className="line-clamp-2 sam-text-xxs font-medium leading-tight text-sam-fg">
                      {t(BOTTOM_NAV_ICON_LABEL_KEYS[iconKey])}
                    </span>
                  </AdminActionButton>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[color:var(--overlay-border)] px-4 py-3">
          <p className={OverlayUi.caption}>{t("admin_menu_bottom_icon_picker_apply_hint")}</p>
          <div className={`${OverlayUi.actionsRow} !mt-0 shrink-0`}>
            <DibayOverlayButton roleTone="secondary" disabled={disabled} onClick={onClose}>
              {t("common_cancel")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              disabled={disabled || !draftChanged}
              onClick={handleApply}
            >
              {t("admin_menu_bottom_icon_apply")}
            </DibayOverlayButton>
          </div>
        </div>
      </div>
    </DibayOverlayRoot>
  );
}

interface MainBottomNavIconPickerTriggerProps {
  value: MainBottomNavIconPickerValue;
  label: string;
  disabled?: boolean;
  onOpen: () => void;
}

/** 테이블 셀 — 현재 아이콘 + 설정 진입 */
export function MainBottomNavIconPickerTrigger({
  value,
  label,
  disabled = false,
  onOpen,
}: MainBottomNavIconPickerTriggerProps) {
  const { t } = useI18n();

  return (
    <AdminActionButton
      variant="neutral"
      size="sm"
      disabled={disabled}
      onClick={onOpen}
      title={t("admin_menu_bottom_icon_configure_title", { name: label })}
      className="max-w-[120px] !px-1.5 font-normal"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sam-fg">
        <MainBottomNavTabIcon tab={value} className="h-4 w-4" />
      </span>
      <span className="truncate sam-text-xxs text-signature">{mainBottomNavIconLabel(value)}</span>
    </AdminActionButton>
  );
}
