"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayOverlayActions } from "@/components/ui/dibay-overlay";
import { REGIONS } from "@/lib/products/form-options";

type CommunityLocalFilterPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  initialRegionId?: string;
  initialCityId?: string;
  onApply: (regionId: string, cityId: string) => void;
};

/**
 * Community Local area picker — filter only (never sets primary address).
 */
export function CommunityLocalFilterPickerSheet({
  open,
  onClose,
  initialRegionId = "",
  initialCityId = "",
  onApply,
}: CommunityLocalFilterPickerSheetProps) {
  const { t, safeT } = useI18n();
  const [regionId, setRegionId] = useState(initialRegionId);
  const [cityId, setCityId] = useState(initialCityId);

  useEffect(() => {
    if (!open) return;
    setRegionId(initialRegionId);
    setCityId(initialCityId);
  }, [open, initialRegionId, initialCityId]);

  const cities = useMemo(() => {
    const region = REGIONS.find((r) => r.id === regionId);
    return region?.cities ?? [];
  }, [regionId]);

  if (!open) return null;

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("community_local_filter_title")}
    >
      <div className="space-y-4 px-4 pb-2">
        <p className="text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-secondary)]">
          {safeT("community_local_filter_hint")}
        </p>
        <div>
          <label className="mb-1 block text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">
            {t("ui_region_label")}
          </label>
          <select
            value={regionId}
            onChange={(e) => {
              setRegionId(e.target.value);
              setCityId("");
            }}
            className={`${OverlayUi.input} !mt-0`}
          >
            <option value="">
              {safeT("community_local_filter_select_region")}
            </option>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">
            {safeT("community_local_filter_area_label")}
          </label>
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            disabled={!regionId}
            className={`${OverlayUi.input} !mt-0`}
          >
            <option value="">
              {safeT("community_local_filter_select_area")}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <DibayOverlayActions
          actions={[
            {
              key: "cancel",
              label: t("common_cancel"),
              roleTone: "secondary",
              onClick: onClose,
            },
            {
              key: "apply",
              label: safeT("community_local_filter_apply"),
              roleTone: "primary",
              disabled: !regionId || !cityId,
              onClick: () => {
                if (!regionId || !cityId) return;
                onApply(regionId, cityId);
                onClose();
              },
            },
          ]}
        />
      </div>
    </DibayBottomSheet>
  );
}
