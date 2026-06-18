import type { ProfileRow } from "@/lib/profile/types";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { hasValidDisplayName } from "@/lib/auth/post-login-profile-policy";
import { isPublicIdSetupComplete } from "@/lib/auth/dibay-public-id-ssot";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";

export type ProfileEditFieldKey = "nickname" | "phone" | "address" | "dibay_id";

export type ProfileEditFieldComplete = Record<ProfileEditFieldKey, boolean>;

export type ProfileEditFormSnapshot = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
};

const DISPLAY_NAME_MAX = 20;

/** 닉네임 비어 있어도 저장 허용 — 입력했으면 2~20자만 검증 */
export function validateOptionalNickname(
  displayName: string,
  messages: { min: string; max: string },
): { displayName?: string } {
  const trimmed = displayName.trim();
  if (!trimmed) return {};
  if (trimmed.length < 2) return { displayName: messages.min };
  if (trimmed.length > DISPLAY_NAME_MAX) return { displayName: messages.max };
  return {};
}

export function pickRepresentativeAddress(rows: UserAddressDTO[] | null): UserAddressDTO | null {
  if (!rows?.length) return null;
  return rows.find((r) => r.isDefaultMaster) ?? null;
}

export function computeProfileEditFieldComplete(input: {
  profile: ProfileRow;
  displayName: string;
  addressList: UserAddressDTO[] | null;
}): ProfileEditFieldComplete {
  const { profile, displayName, addressList } = input;
  const usernameComplete = isPublicIdSetupComplete(profile);

  return {
    nickname: hasValidDisplayName({
      display_name: displayName,
      nickname: profile.nickname,
    }),
    /** OTP·관리자 승인 동일 — 설정 enabled 와 무관하게 인증 여부만 본다 */
    phone: isProfileContactVerified(profile),
    address: Boolean(pickRepresentativeAddress(addressList)),
    dibay_id: usernameComplete,
  };
}

export function listIncompleteProfileEditFields(complete: ProfileEditFieldComplete): ProfileEditFieldKey[] {
  const keys: ProfileEditFieldKey[] = [];
  if (!complete.nickname) keys.push("nickname");
  if (!complete.phone) keys.push("phone");
  if (!complete.address) keys.push("address");
  if (!complete.dibay_id) keys.push("dibay_id");
  return keys;
}

export function buildProfileEditIncompleteBody(
  fields: ProfileEditFieldKey[],
  labels: Record<ProfileEditFieldKey, string>,
): string {
  if (fields.length === 0) return "";
  return fields.map((f) => labels[f]).join(" · ");
}

export function captureProfileEditFormSnapshot(input: {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}): ProfileEditFormSnapshot {
  return {
    displayName: input.displayName.trim(),
    bio: input.bio.trim(),
    avatarUrl: withDefaultAvatar(input.avatarUrl),
  };
}

export function isProfileEditFormDirty(
  baseline: ProfileEditFormSnapshot | null,
  current: ProfileEditFormSnapshot,
): boolean {
  if (!baseline) return false;
  return (
    baseline.displayName !== current.displayName ||
    baseline.bio !== current.bio ||
    baseline.avatarUrl !== current.avatarUrl
  );
}
