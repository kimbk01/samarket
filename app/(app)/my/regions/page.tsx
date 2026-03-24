"use client";

import { MyRegionSettingsView } from "@/components/regions/MyRegionSettingsView";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function MyRegionsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          내 동네 설정
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="pt-4">
        <MyRegionSettingsView />
      </div>
    </div>
  );
}
