export function isVerifiedMember(profile: {
  phone_verified?: boolean | null;
  member_status?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  const status = String(profile.member_status ?? "").trim().toLowerCase();
  return profile.phone_verified === true && (status === "active" || status === "verified_member");
}
