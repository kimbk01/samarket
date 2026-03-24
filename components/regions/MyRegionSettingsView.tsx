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
        <p className="text-[14px] text-gray-600">
          등록된 동네가 없어요. 동네를 추가하면 해당 지역 기반으로 상품을 볼 수 있어요.
        </p>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-4 w-full rounded-lg bg-signature py-3 text-[15px] font-medium text-white"
        >
          동네 추가하기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-24">
      {showAddForm ? (
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <h2 className="mb-4 text-[15px] font-semibold text-gray-900">
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
            className="w-full rounded-lg border-2 border-dashed border-gray-200 py-3 text-[14px] font-medium text-gray-600"
          >
            + 동네 추가
          </button>
        </>
      )}
    </div>
  );
}
