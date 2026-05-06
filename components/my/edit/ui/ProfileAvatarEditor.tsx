"use client";

import { ProfileImageField } from "@/components/my/edit/ProfileImageField";

export function ProfileAvatarEditor({
  avatarUrl,
  onChangeUrl,
}: {
  avatarUrl: string | null;
  onChangeUrl: (url: string | null) => void;
}) {
  return <ProfileImageField avatarUrl={avatarUrl} onChangeUrl={onChangeUrl} />;
}

