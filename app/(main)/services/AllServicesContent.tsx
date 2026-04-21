"use client";

import { AllServicesSection } from "@/components/home/AllServicesSection";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export function AllServicesContent() {
  return (
    <div className="space-y-6">
      <header className="flex h-12 shrink-0 items-center border-b border-sam-border-soft bg-sam-surface -mx-4 px-4">
        <AppBackButton backHref="/home" ariaLabel="뒤로" />
        <h1 className="flex-1 text-center sam-text-page-title font-semibold text-sam-fg">
          전체 서비스
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <AllServicesSection />
    </div>
  );
}
