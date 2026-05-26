"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type AddressDesignationPreset = "home" | "office" | "custom" | "shop";

const RADIO_CLASS = "h-3.5 w-3.5 shrink-0 border-sam-border text-signature sm:h-4 sm:w-4";

export function AddressDesignationField(props: {
  name: string;
  value: AddressDesignationPreset | null;
  onChange: (next: AddressDesignationPreset) => void;
  customName: string;
  onCustomNameChange: (next: string) => void;
  showTypeError?: boolean;
  /** 승인 매장이 있을 때만 Store 라디오 노출 */
  showStoreOption?: boolean;
  selectedStoreId?: string;
  storeOptions?: ReadonlyArray<{ id: string; label: string }>;
  storesLoading?: boolean;
  storesError?: string | null;
  onStoreChange?: (storeId: string) => void;
  /** 섹션 카드 헤더를 부모(`OwnerStoreAdminDashSection`)에 둘 때 중복 제목 숨김 */
  hideSectionHeader?: boolean;
}) {
  const { t } = useI18n();
  const {
    name,
    value,
    onChange,
    customName,
    onCustomNameChange,
    showTypeError = false,
    showStoreOption = false,
    selectedStoreId = "",
    storeOptions = [],
    storesLoading = false,
    storesError = null,
    onStoreChange,
    hideSectionHeader = false,
  } = props;

  const fieldLabelClass = "mb-1.5 block text-[12px] font-semibold leading-4 text-sam-muted";
  const fieldInputClass =
    "w-full rounded-lg border border-sam-border bg-sam-app px-3 py-2.5 sam-text-body text-sam-fg outline-none transition-shadow placeholder:text-sam-muted focus-visible:border-sam-primary focus-visible:ring-2 focus-visible:ring-sam-primary/20";

  const options: {
    id: AddressDesignationPreset;
    labelKey: "addr_ui_preset_home" | "addr_ui_preset_office" | "addr_ui_preset_custom" | "addr_ui_preset_shop";
  }[] = [
    { id: "home", labelKey: "addr_ui_preset_home" },
    { id: "office", labelKey: "addr_ui_preset_office" },
    { id: "custom", labelKey: "addr_ui_preset_custom" },
  ];
  if (showStoreOption) {
    options.push({ id: "shop", labelKey: "addr_ui_preset_shop" });
  }

  return (
    <div>
      {!hideSectionHeader ? (
        <div className="mb-3 flex min-w-0 flex-wrap items-baseline gap-x-1">
          <p className="sam-text-body font-semibold leading-snug text-sam-fg">{t("addr_ui_designation_section")}</p>
          <span className="sam-text-xxs leading-snug text-sam-muted" aria-hidden>
            -
          </span>
          <p className="sam-text-xxs leading-snug text-sam-muted">{t("addr_ui_designation_section_hint")}</p>
        </div>
      ) : null}
      <div
        className="-mx-1 flex min-w-0 flex-nowrap items-center gap-x-3 gap-y-0 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="radiogroup"
        aria-label={t("addr_ui_designation_section")}
      >
        {options.map((opt) => (
          <label
            key={opt.id}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 py-1 sm:gap-2"
          >
            <input
              type="radio"
              name={name}
              checked={value === opt.id}
              onChange={() => onChange(opt.id)}
              className={RADIO_CLASS}
            />
            <span className="whitespace-nowrap text-[13px] leading-4 text-sam-fg sm:sam-text-body" translate="no">
              {t(opt.labelKey)}
            </span>
          </label>
        ))}
      </div>
      {showTypeError && !value ? (
        <p className="mt-2 sam-text-helper font-medium text-sam-danger">{t("addr_ui_pick_type_err")}</p>
      ) : null}
      {value === "custom" ? (
        <div className="mt-3">
          <label htmlFor={`${name}-custom-nick`} className={fieldLabelClass}>
            {t("addr_ui_custom_name_label")}
          </label>
          <input
            id={`${name}-custom-nick`}
            value={customName}
            onChange={(e) => onCustomNameChange(e.target.value)}
            placeholder={t("addr_ui_custom_name_ph")}
            autoComplete="off"
            className={fieldInputClass}
          />
        </div>
      ) : null}
      {value === "shop" ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`${name}-store`} className={fieldLabelClass}>
            {t("addr_ui_linked_store")}
          </label>
          {storesLoading ? (
            <p className="sam-text-helper text-sam-muted">{t("addr_ui_shop_list_loading")}</p>
          ) : null}
          {storesError ? <p className="sam-text-helper text-sam-danger">{storesError}</p> : null}
          {!storesLoading && storeOptions.length > 0 ? (
            <select
              id={`${name}-store`}
              value={selectedStoreId}
              onChange={(e) => onStoreChange?.(e.target.value)}
              className={fieldInputClass}
              aria-label={t("addr_ui_pick_store_aria")}
            >
              <option value="">{t("addr_ui_pick_store")}</option>
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
