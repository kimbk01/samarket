"use client";

import type { UserRegion } from "@/lib/regions/types";
import { SavedRegionCard } from "./SavedRegionCard";

interface SavedRegionListProps {
  regions: UserRegion[];
  currentRegionId: string | null;
  onSetPrimary: (id: string) => void;
  onRemove: (id: string) => void;
  onSelectCurrent: (id: string) => void;
}

export function SavedRegionList({
  regions,
  currentRegionId,
  onSetPrimary,
  onRemove,
  onSelectCurrent,
}: SavedRegionListProps) {
  if (regions.length === 0) return null;

  return (
    <ul className="space-y-2">
      {regions.map((region) => (
        <li key={region.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectCurrent(region.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectCurrent(region.id);
              }
            }}
            className="w-full cursor-pointer text-left"
          >
            <SavedRegionCard
              region={region}
              isCurrent={currentRegionId === region.id}
              onSetPrimary={onSetPrimary}
              onRemove={onRemove}
              canRemove={regions.length > 1}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
