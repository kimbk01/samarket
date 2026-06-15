import type { ProfileRow } from "@/lib/profile/types";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { hasValidDisplayName } from "@/lib/auth/post-login-profile-policy";
import { isDibayIdComplete } from "@/lib/auth/dibay-signup-status";
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
  phoneVerificationEnabled: boolean;
}): ProfileEditFieldComplete {
  const { profile, displayName, addressList, phoneVerificationEnabled } = input;
  const usernameComplete = isDibayIdComplete({
    dibay_id: profile.dibay_id,
    dibay_id_locked: profile.dibay_id_locked,
    username: profile.username,
    username_confirmed: profile.dibay_id_locked === true ? true : null,
  });

  return {
    nickname: hasValidDisplayName({
      display_name: displayName,
      nickname: profile.nickname,
    }),
    phone: phoneVerificationEnabled ? isProfileContactVerified(profile) : true,
    address: Boolean(pickRepresentativeAddress(addressList)),
    dibay_id: usernameComplete,
  };
}

export function listIncompleteProfileEditFields(
  complete: ProfileEditFieldComplete,
  phoneVerificationEnabled: boolean,
): ProfileEditFieldKey[] {
  const keys: ProfileEditFieldKey[] = [];
  if (!complete.nickname) keys.push("nickname");
  if (phoneVerificationEnabled && !complete.phone) keys.push("phone");
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
