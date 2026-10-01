/**
 * R0 FINAL Operator Console — Screen Catalog S01–S28 (machine-readable).
 * R1 does not build all screens; it prevents silent screen deletion.
 */

export const MEMBER_ADMIN_SCREEN_CATALOG_AUTHORITY = "R0_FINAL_OPERATOR_CONSOLE_SSOT" as const;

export type MemberAdminScreenRow = {
  id: string;
  nameEn: string;
  summaryKo: string;
  dialogSize?: "small" | "standard" | "large";
};

export const MEMBER_ADMIN_SCREEN_CATALOG = [
  { id: "S01", nameEn: "Member List", summaryKo: "columns/filters/search/create CTA" },
  { id: "S02", nameEn: "Detail Overview", summaryKo: "header + cards + tab shell" },
  { id: "S03", nameEn: "Account/Auth", summaryKo: "login · synthetic · verify summary" },
  { id: "S04", nameEn: "Store", summaryKo: "store facts + CTA" },
  { id: "S05", nameEn: "Activity", summaryKo: "activity list" },
  { id: "S06", nameEn: "Trade", summaryKo: "trade domain" },
  { id: "S07", nameEn: "Delivery/Order", summaryKo: "orders" },
  { id: "S08", nameEn: "Chat/Group", summaryKo: "rooms + messenger CTA" },
  { id: "S09", nameEn: "Reports/Moderation", summaryKo: "reports + sanction CTAs" },
  { id: "S10", nameEn: "Address", summaryKo: "addresses" },
  { id: "S11", nameEn: "Operations History", summaryKo: "timeline" },
  { id: "S12", nameEn: "Member Create", summaryKo: "dialog create", dialogSize: "large" },
  { id: "S13", nameEn: "Profile Edit", summaryKo: "dialog profile-only", dialogSize: "standard" },
  { id: "S14", nameEn: "@ID Change", summaryKo: "dedicated dialog", dialogSize: "small" },
  { id: "S15", nameEn: "Verification Management", summaryKo: "인증 관리 dialog", dialogSize: "standard" },
  { id: "S16", nameEn: "Password Management", summaryKo: "temp password dialog", dialogSize: "small" },
  { id: "S17", nameEn: "Admin Privilege", summaryKo: "promote/revoke", dialogSize: "standard" },
  { id: "S18", nameEn: "Warning", summaryKo: "confirm dialog", dialogSize: "small" },
  { id: "S19", nameEn: "Suspend", summaryKo: "confirm dialog", dialogSize: "small" },
  { id: "S20", nameEn: "Unsuspend", summaryKo: "confirm dialog", dialogSize: "small" },
  { id: "S21", nameEn: "Block", summaryKo: "confirm dialog", dialogSize: "small" },
  { id: "S22", nameEn: "Unblock", summaryKo: "confirm dialog", dialogSize: "small" },
  { id: "S23", nameEn: "Withdraw", summaryKo: "danger confirm", dialogSize: "small" },
  { id: "S24", nameEn: "Permanent Delete", summaryKo: "danger confirm + typed id", dialogSize: "standard" },
  { id: "S25", nameEn: "Communication", summaryKo: "Support compose bridge" },
  { id: "S26", nameEn: "Deletion Request", summaryKo: "queue + process" },
  { id: "S27", nameEn: "Store Relation Management", summaryKo: "1계정=1매장 운영 관계 (신청·승인 권위)" },
  { id: "S28", nameEn: "Test Member Maintenance", summaryKo: "OD-05 gated" },
] as const satisfies readonly MemberAdminScreenRow[];

export const MEMBER_ADMIN_SCREEN_CATALOG_COUNT = MEMBER_ADMIN_SCREEN_CATALOG.length;

export const MEMBER_ADMIN_SCREEN_IDS = MEMBER_ADMIN_SCREEN_CATALOG.map((r) => r.id);

export function memberAdminDialogSizeForScreen(screenId: string): "small" | "standard" | "large" | null {
  const row = MEMBER_ADMIN_SCREEN_CATALOG.find((r) => r.id === screenId) as MemberAdminScreenRow | undefined;
  return row?.dialogSize ?? null;
}
