"use client";

import { useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import { SavedRegionList } from "./SavedRegionList";
import { RegionSelectorForm } from "./RegionSelectorForm";

export function MyRegionSettingsView() {
  const {
    userRegions,
    currentRegion,
    setCurrentRegion,
    setPrimaryRegion,
    addRegion,
    removeRegion,
    refreshUserRegions,
  } = useRegion();
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = (
    regionId: string,
    cityId: string,
    barangay: string,
    setAsPrimary: boolean
  ) => {
    addRegion(regionId, cityId, barangay, setAsPrimary);
    setShowAddForm(false);
    refreshUserRegions();
  };

  const handleSetPrimary = (id: string) => {
    setPrimaryRegion(id);
  };

  const handleRemove = (id: string) => {
    if (removeRegion(id)) refreshUserRegions();
  };

  const handleSelectCurrent = (id: string) => {
    setCurrentRegion(id);
  };

  if (userRegions.length === 0 && !showAddForm) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="text-[14px] text-sam-muted">
          등록된 동네가 없어요. 동네를 추가하면 해당 지역 기반으로 상품을 볼 수 있어요.
        </p>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-4 w-full rounded-ui-rect bg-signature py-3 text-[15px] font-medium text-white"
        >
          동네 추가하기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-24">
      {showAddForm ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
          <h2 className="mb-4 text-[15px] font-semibold text-sam-fg">
            동네 추가
          </h2>
          <RegionSelectorForm
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      ) : (
        <>
          <SavedRegionList
            regions={userRegions}
            currentRegionId={currentRegion?.id ?? null}
            onSetPrimary={handleSetPrimary}
            onRemove={handleRemove}
            onSelectCurrent={handleSelectCurrent}
          />
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full rounded-ui-rect border-2 border-dashed border-sam-border py-3 text-[14px] font-medium text-sam-muted"
          >
            + 동네 추가
          </button>
        </>
      )}
    </div>
  );
}
