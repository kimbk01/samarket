"use client";

import type { ProfileRow } from "@/lib/profile/types";
import { ProfileReadonlyFields } from "@/components/my/edit/ProfileReadonlyFields";

export function ProfileReadOnlyInfoCard({ profile }: { profile: ProfileRow }) {
  return (
    <div className="rounded-[12px] border border-sam-border bg-sam-surface p-4">
      <ProfileReadonlyFields profile={profile} />
    </div>
  );
}

