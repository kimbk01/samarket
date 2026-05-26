"use client";

import type { ProfileRow } from "@/lib/profile/types";
import { ProfileReadonlyFields } from "@/components/my/edit/ProfileReadonlyFields";

export function ProfileReadOnlyInfoCard({ profile }: { profile: ProfileRow }) {
  return <ProfileReadonlyFields profile={profile} />;
}
