"use client";

import { useSearchParams } from "next/navigation";
import { MyPageContent } from "./MyPageContent";
import { MyPageLayout } from "./MyPageLayout";
import { normalizeMyPageSection, normalizeMyPageTab } from "./mypage-nav";
import type { MyPageConsoleProps } from "./types";

export function MyPageConsole(props: MyPageConsoleProps) {
  const searchParams = useSearchParams();
  const activeTab = normalizeMyPageTab(searchParams.get("tab"));
  const activeSection = normalizeMyPageSection(
    activeTab,
    searchParams.get("section"),
  );

  return (
    <MyPageLayout
      activeTab={activeTab}
      activeSection={activeSection}
      profile={props.profile}
      mannerScore={props.mannerScore}
    >
      <MyPageContent
        activeTab={activeTab}
        activeSection={activeSection}
        {...props}
      />
    </MyPageLayout>
  );
}
