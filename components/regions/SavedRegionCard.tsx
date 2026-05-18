"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { UserRegion } from "@/lib/regions/types";
import { PrimaryRegionBadge } from "./PrimaryRegionBadge";

interface SavedRegionCardProps {
  region: UserRegion;
  isCurrent: boolean;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

export function SavedRegionCard({
  region,
  isCurrent,
  onSetPrimary,
  onRemove,
  canRemove,
}: SavedRegionCardProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
      <div>
        <p className="sam-text-body font-medium text-sam-fg">{region.label}</p>
        <div className="mt-1 flex items-center gap-2">
          {region.isPrimary && <PrimaryRegionBadge />}
          {isCurrent && (
            <span className="sam-text-helper text-sam-muted">{t("ui_region_current_neighborhood")}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!region.isPrimary && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetPrimary(region.id);
            }}
            className="sam-text-body-secondary text-signature"
          >
            {t("ui_region_set_primary")}
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(region.id);
            }}
            className="sam-text-body-secondary text-sam-muted"
          >
            {t("ui_region_remove")}
          </button>
        )}
      </div>
    </div>
  );
}
