/**
 * 21단계: 비즈프로필 mock (local state)
 */

import type { BusinessProfile, BusinessProfileStatus } from "@/lib/types/business";
import { slugify } from "./business-utils";
import { addBusinessLog } from "./mock-business-logs";

function combinedAddressDisplay(street: string, detail: string): string {
  const s = street.trim();
  const d = detail.trim();
  if (s && d) return `${s}, ${d}`;
  return s || d;
}

const PROFILES: BusinessProfile[] = [
  {
    id: "bp-1",
    ownerUserId: "me",
    ownerNickname: "KASAMA",
    shopName: "카사마 샵",
    slug: "kasama-shop",
    logoUrl: "",
    description: "중고거래 믿을 수 있는 샵입니다.",
    phone: "+63 900 000 0000",
    kakaoId: "",
    region: "마닐라",
    city: "Malate",
    barangay: "",
    addressStreetLine: "Roxas Blvd, Malate, Manila",
    addressDetail: "2층 유닛 (출입: 경비실 안내)",
    addressLabel: combinedAddressDisplay(
      "Roxas Blvd, Malate, Manila",
      "2층 유닛 (출입: 경비실 안내)"
    ),
    category: "일반",
    status: "active",
    followerCount: 12,
    productCount: 3,
    reviewCount: 5,
    averageRating: 4.6,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: new Date(Date.now() - 86400000 * 28).toISOString(),
  },
  {
    id: "bp-2",
    ownerUserId: "s4",
    ownerNickname: "판매자D",
    shopName: "디지털 마켓",
    slug: "digital-market",
    logoUrl: "",
    description: "디지털/가전 전문",
    phone: "",
    kakaoId: "digital_market",
    region: "퀘존시티",
    city: "Diliman",
    barangay: "",
    addressStreetLine: "Katipunan Ave, Diliman, Quezon City",
    addressDetail: "",
    addressLabel: "Katipunan Ave, Diliman, Quezon City",
    category: "디지털/가전",
    status: "active",
    followerCount: 8,
    productCount: 5,
    reviewCount: 3,
    averageRating: 4.8,
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: new Date(Date.now() - 86400000 * 58).toISOString(),
  },
  {
    id: "bp-3",
    ownerUserId: "u-pending",
    ownerNickname: "신청자",
    shopName: "대기중 상점",
    slug: "pending-shop",
    logoUrl: "",
    description: "심사 대기",
    phone: "",
    kakaoId: "",
    region: "마닐라",
    city: "",
    barangay: "",
    addressStreetLine: "",
    addressDetail: "",
    addressLabel: "",
    category: "일반",
    status: "pending",
    followerCount: 0,
    productCount: 0,
    reviewCount: 0,
    averageRating: 0,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: "",
  },
];

function nextId(prefix: string): string {
  const nums = PROFILES.map((p) =>
    parseInt(p.id.replace(prefix, ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${max + 1}`;
}

export const CURRENT_USER_ID = "me";

export function getBusinessProfileByOwnerUserId(
  userId: string
): BusinessProfile | undefined {
  return PROFILES.find((p) => p.ownerUserId === userId);
}

export function getBusinessProfileBySlug(
  slug: string
): BusinessProfile | undefined {
  const p = PROFILES.find((x) => x.slug === slug);
  if (!p || p.status !== "active") return undefined;
  return { ...p };
}

export function getBusinessProfileById(id: string): BusinessProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

export function getBusinessProfilesForAdmin(): BusinessProfile[] {
  return PROFILES.map((p) => ({ ...p }));
}

export function applyBusinessProfile(input: {
  ownerUserId: string;
  ownerNickname: string;
  shopName: string;
  description?: string;
  phone?: string;
  kakaoId?: string;
  region?: string;
  city?: string;
  addressStreetLine?: string;
  addressDetail?: string;
  /** @deprecated 한 줄만 넘길 때 street 으로 취급 */
  addressLabel?: string;
  category?: string;
}): BusinessProfile {
  const slug = slugify(input.shopName) || `shop-${input.ownerUserId}`.toLowerCase();
  const existingByUser = PROFILES.find((p) => p.ownerUserId === input.ownerUserId);
  if (existingByUser) {
    const existing = existingByUser;
    existing.shopName = input.shopName;
    existing.description = input.description ?? "";
    existing.phone = input.phone ?? "";
    existing.kakaoId = input.kakaoId ?? "";
    existing.region = input.region ?? "";
    existing.city = input.city ?? "";
    const st = input.addressStreetLine ?? input.addressLabel ?? "";
    const det = input.addressDetail ?? "";
    existing.addressStreetLine = st;
    existing.addressDetail = det;
    existing.addressLabel = combinedAddressDisplay(st, det);
    existing.category = input.category ?? "일반";
    existing.updatedAt = new Date().toISOString();
    addBusinessLog(existing.id, "update_profile", "admin-1", "관리자", "프로필 수정");
    return { ...existing };
  }
  let uniqueSlug = slug;
  let n = 0;
  while (PROFILES.some((p) => p.slug === uniqueSlug)) {
    n++;
    uniqueSlug = `${slug}-${n}`;
  }
  const now = new Date().toISOString();
  const stNew = input.addressStreetLine ?? input.addressLabel ?? "";
  const detNew = input.addressDetail ?? "";
  const profile: BusinessProfile = {
    id: nextId("bp-"),
    ownerUserId: input.ownerUserId,
    ownerNickname: input.ownerNickname,
    shopName: input.shopName,
    slug: uniqueSlug,
    logoUrl: "",
    description: input.description ?? "",
    phone: input.phone ?? "",
    kakaoId: input.kakaoId ?? "",
    region: input.region ?? "",
    city: input.city ?? "",
    barangay: "",
    addressStreetLine: stNew,
    addressDetail: detNew,
    addressLabel: combinedAddressDisplay(stNew, detNew),
    category: input.category ?? "일반",
    status: "pending",
    followerCount: 0,
    productCount: 0,
    reviewCount: 0,
    averageRating: 0,
    createdAt: now,
    updatedAt: now,
    approvedAt: "",
  };
  PROFILES.push(profile);
  addBusinessLog(profile.id, "apply", "admin-1", "시스템", "비즈프로필 신청");
  return { ...profile };
}

export function updateBusinessProfile(
  id: string,
  patch: Partial<
    Pick<
      BusinessProfile,
      | "shopName"
      | "slug"
      | "logoUrl"
      | "description"
      | "phone"
      | "kakaoId"
      | "region"
      | "city"
      | "barangay"
      | "addressStreetLine"
      | "addressDetail"
      | "addressLabel"
      | "category"
    >
  >
): BusinessProfile | undefined {
  const idx = PROFILES.findIndex((p) => p.id === id);
  if (idx < 0) return undefined;
  const now = new Date().toISOString();
  if (patch.shopName && !patch.slug) patch.slug = slugify(patch.shopName);
  const prev = PROFILES[idx];
  const nextStreet =
    patch.addressStreetLine !== undefined ? patch.addressStreetLine : prev.addressStreetLine;
  const nextDetail =
    patch.addressDetail !== undefined ? patch.addressDetail : prev.addressDetail;
  const label =
    patch.addressStreetLine !== undefined || patch.addressDetail !== undefined
      ? combinedAddressDisplay(nextStreet, nextDetail)
      : (patch.addressLabel ?? prev.addressLabel);
  PROFILES[idx] = {
    ...prev,
    ...patch,
    addressStreetLine: nextStreet,
    addressDetail: nextDetail,
    addressLabel: label,
    updatedAt: now,
  };
  addBusinessLog(id, "update_profile", "admin-1", "관리자", "프로필 수정");
  return { ...PROFILES[idx] };
}

export function setBusinessProfileStatus(
  id: string,
  status: BusinessProfileStatus
): BusinessProfile | undefined {
  const idx = PROFILES.findIndex((p) => p.id === id);
  if (idx < 0) return undefined;
  const now = new Date().toISOString();
  const prev = PROFILES[idx].status;
  PROFILES[idx] = { ...PROFILES[idx], status, updatedAt: now };
  if (status === "active") {
    PROFILES[idx].approvedAt = PROFILES[idx].approvedAt || now;
  }
  let actionType: "approve" | "reject" | "pause" | "resume" = "approve";
  let note: string = status;
  if (status === "active") {
    actionType = prev === "paused" ? "resume" : "approve";
    note = prev === "paused" ? "재개" : "승인";
  } else if (status === "rejected") {
    actionType = "reject";
    note = "반려";
  } else if (status === "paused") {
    actionType = "pause";
    note = "일시중지";
  }
  addBusinessLog(id, actionType, "admin-1", "관리자", note);
  return { ...PROFILES[idx] };
}

export function setBusinessProfileAdminMemo(
  id: string,
  adminMemo: string
): void {
  const p = PROFILES.find((x) => x.id === id);
  if (p) p.adminMemo = adminMemo;
}
