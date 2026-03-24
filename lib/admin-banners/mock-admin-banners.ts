/**
 * 20단계: 관리자 배너 mock (local state)
 */

import type {
  AdminBanner,
  BannerStatus,
  BannerPlacement,
  BannerChangeLog,
  BannerChangeActionType,
} from "@/lib/types/admin-banner";

const BANNERS: AdminBanner[] = [
  {
    id: "bn-1",
    title: "봄맞이 특가",
    description: "홈 상단 메인 배너",
    imageUrl: "/placeholder-banner.png",
    mobileImageUrl: "/placeholder-banner-m.png",
    targetUrl: "https://example.com/event",
    placement: "home_top",
    status: "active",
    priority: 1,
    startAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 28).toISOString(),
    clickCount: 120,
    impressionCount: 3400,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "admin-1",
    adminMemo: "3월 캠페인",
  },
  {
    id: "bn-2",
    title: "신규 가입 이벤트",
    description: "홈 중단",
    imageUrl: "/placeholder-banner2.png",
    mobileImageUrl: "/placeholder-banner2-m.png",
    targetUrl: "https://example.com/join",
    placement: "home_middle",
    status: "active",
    priority: 1,
    startAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 20).toISOString(),
    clickCount: 45,
    impressionCount: 1200,
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    createdBy: "admin-1",
  },
  {
    id: "bn-3",
    title: "초안 배너",
    description: "미배포",
    imageUrl: "",
    mobileImageUrl: "",
    targetUrl: "",
    placement: "search_top",
    status: "draft",
    priority: 0,
    startAt: "",
    endAt: "",
    clickCount: 0,
    impressionCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "admin-1",
  },
  {
    id: "bn-4",
    title: "종료된 배너",
    description: "만료",
    imageUrl: "/placeholder-old.png",
    mobileImageUrl: "/placeholder-old-m.png",
    targetUrl: "https://example.com/old",
    placement: "home_top",
    status: "expired",
    priority: 0,
    startAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    endAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    clickCount: 500,
    impressionCount: 10000,
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    createdBy: "admin-1",
  },
];

const CHANGE_LOGS: BannerChangeLog[] = [
  {
    id: "cl-1",
    bannerId: "bn-1",
    actionType: "create",
    adminId: "admin-1",
    adminNickname: "관리자",
    note: "배너 생성",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "cl-2",
    bannerId: "bn-1",
    actionType: "activate",
    adminId: "admin-1",
    adminNickname: "관리자",
    note: "노출 시작",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

const MOCK_ADMIN = { id: "admin-1", nickname: "관리자" };

function nextId(prefix: string, list: { id: string }[]): string {
  const nums = list
    .map((x) => parseInt(x.id.replace(prefix, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${max + 1}`;
}

export function getBanners(): AdminBanner[] {
  return BANNERS.map((b) => ({ ...b }));
}

export function getBannerById(id: string): AdminBanner | undefined {
  return BANNERS.find((b) => b.id === id);
}

function ensureExpired(b: AdminBanner): AdminBanner {
  if (b.status !== "active" && b.status !== "paused") return b;
  if (!b.endAt) return b;
  if (new Date(b.endAt) >= new Date()) return b;
  return { ...b, status: "expired" as BannerStatus };
}

export function getBannersForAdmin(): AdminBanner[] {
  return BANNERS.map(ensureExpired).map((b) => ({ ...b }));
}

export function getBannerForAdminById(id: string): AdminBanner | undefined {
  const b = BANNERS.find((x) => x.id === id);
  return b ? ensureExpired({ ...b }) : undefined;
}

export type CreateBannerInput = Pick<
  AdminBanner,
  "title" | "description" | "imageUrl" | "mobileImageUrl" | "targetUrl" | "placement" | "priority" | "startAt" | "endAt" | "adminMemo" | "createdBy"
> & { status: BannerStatus };

export function createBanner(input: CreateBannerInput): AdminBanner {
  const now = new Date().toISOString();
  const banner: AdminBanner = {
    id: nextId("bn-", BANNERS),
    title: input.title ?? "",
    description: input.description ?? "",
    imageUrl: input.imageUrl ?? "",
    mobileImageUrl: input.mobileImageUrl ?? "",
    targetUrl: input.targetUrl ?? "",
    placement: input.placement,
    status: input.status,
    priority: input.priority ?? 0,
    startAt: input.startAt ?? "",
    endAt: input.endAt ?? "",
    clickCount: 0,
    impressionCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    adminMemo: input.adminMemo,
  };
  BANNERS.push(banner);
  addChangeLog(banner.id, "create", MOCK_ADMIN.id, MOCK_ADMIN.nickname, "배너 생성");
  return { ...banner };
}

export function updateBanner(
  id: string,
  patch: Partial<Pick<AdminBanner, "title" | "description" | "imageUrl" | "mobileImageUrl" | "targetUrl" | "placement" | "priority" | "startAt" | "endAt" | "adminMemo" | "status">>
): AdminBanner | undefined {
  const idx = BANNERS.findIndex((b) => b.id === id);
  if (idx < 0) return undefined;
  const now = new Date().toISOString();
  const prevStatus = BANNERS[idx].status;
  BANNERS[idx] = { ...BANNERS[idx], ...patch, updatedAt: now };
  if (patch.status !== undefined && patch.status !== prevStatus) {
    const actionType: BannerChangeActionType =
      patch.status === "active" ? "activate" : patch.status === "paused" ? "pause" : patch.status === "hidden" ? "hide" : "update";
    addChangeLog(id, actionType, MOCK_ADMIN.id, MOCK_ADMIN.nickname, `상태: ${patch.status}`);
  } else {
    addChangeLog(id, "update", MOCK_ADMIN.id, MOCK_ADMIN.nickname, "배너 수정");
  }
  return { ...BANNERS[idx] };
}

export function setBannerStatus(
  id: string,
  status: BannerStatus
): AdminBanner | undefined {
  const idx = BANNERS.findIndex((b) => b.id === id);
  if (idx < 0) return undefined;
  const now = new Date().toISOString();
  BANNERS[idx] = { ...BANNERS[idx], status, updatedAt: now };
  const actionType: BannerChangeActionType =
    status === "active" ? "activate" : status === "paused" ? "pause" : status === "hidden" ? "hide" : "expire";
  addChangeLog(id, actionType, MOCK_ADMIN.id, MOCK_ADMIN.nickname, `상태: ${status}`);
  return { ...BANNERS[idx] };
}

function addChangeLog(
  bannerId: string,
  actionType: BannerChangeActionType,
  adminId: string,
  adminNickname: string,
  note: string
): void {
  const log: BannerChangeLog = {
    id: nextId("cl-", CHANGE_LOGS),
    bannerId,
    actionType,
    adminId,
    adminNickname,
    note,
    createdAt: new Date().toISOString(),
  };
  CHANGE_LOGS.push(log);
}

export function getBannerChangeLogs(bannerId: string): BannerChangeLog[] {
  return CHANGE_LOGS.filter((l) => l.bannerId === bannerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
