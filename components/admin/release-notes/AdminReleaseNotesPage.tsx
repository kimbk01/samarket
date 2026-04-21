"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ReleaseNoteTable } from "./ReleaseNoteTable";
import { PostReleaseCheckTable } from "./PostReleaseCheckTable";
import { ReleaseReadinessCard } from "./ReleaseReadinessCard";

type TabId = "notes" | "post-release" | "readiness";

const TABS: { id: TabId; label: string }[] = [
  { id: "notes", label: "릴리즈 노트" },
  { id: "post-release", label: "배포 후 검증" },
  { id: "readiness", label: "릴리즈 준비" },
];

export function AdminReleaseNotesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("notes");

  return (
    <>
      <AdminPageHeader title="릴리즈 노트" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "notes" && (
        <AdminCard title="릴리즈 노트 목록">
          <ReleaseNoteTable />
        </AdminCard>
      )}
      {activeTab === "post-release" && (
        <AdminCard title="배포 후 검증">
          <PostReleaseCheckTable />
        </AdminCard>
      )}
      {activeTab === "readiness" && (
        <AdminCard title="릴리즈 준비 상태">
          <ReleaseReadinessCard />
        </AdminCard>
      )}
    </>
  );
}
