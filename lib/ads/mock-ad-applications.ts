/**
 * 22단계: 광고 신청 mock (local state)
 */

import type {
  AdApplication,
  AdApplicationStatus,
  AdPaymentStatus,
  AdTargetType,
  AdPlacement,
  AdPaymentMethod,
} from "@/lib/types/ad-application";
import { getAdPlanById } from "./mock-ad-plans";
import { addAdApplicationLog } from "./mock-ad-logs";
import {
  createPromotedItem,
  getPromotedItemByApplicationId,
  setPromotedItemStatusByApplicationId,
} from "./mock-promoted-items";
import { getProductById } from "@/lib/mock-products";
import { getBusinessProfileById } from "@/lib/business/mock-business-profiles";

const APPLICATIONS: AdApplication[] = [
  {
    id: "ad-1",
    applicantUserId: "me",
    applicantNickname: "KASAMA",
    targetType: "product",
    targetId: "1",
    targetTitle: "아이폰 14 Pro 256GB",
    placement: "home_top",
    planName: "홈 상단 7일",
    durationDays: 7,
    unitPrice: 5000,
    totalPrice: 5000,
    paymentMethod: "manual_confirm",
    paymentStatus: "paid",
    applicationStatus: "active",
    startAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ad-2",
    applicantUserId: "me",
    applicantNickname: "KASAMA",
    targetType: "product",
    targetId: "2",
    targetTitle: "맥북 에어 M2",
    placement: "home_middle",
    planName: "홈 중단 7일",
    durationDays: 7,
    unitPrice: 3000,
    totalPrice: 3000,
    paymentMethod: "bank_transfer",
    paymentStatus: "waiting_confirm",
    applicationStatus: "waiting_payment",
    startAt: "",
    endAt: "",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_ADMIN = { id: "admin-1", nickname: "관리자" };
export const CURRENT_USER_ID = "me";
const MOCK_NICKNAME = "KASAMA";

function nextId(): string {
  const nums = APPLICATIONS.map((a) =>
    parseInt(a.id.replace("ad-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ad-${max + 1}`;
}

export function getAdApplicationsForUser(userId: string): AdApplication[] {
  return APPLICATIONS.filter((a) => a.applicantUserId === userId)
    .map((a) => ({ ...a }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function getAdApplicationsForAdmin(): AdApplication[] {
  return APPLICATIONS.map((a) => ({ ...a })).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getAdApplicationById(id: string): AdApplication | undefined {
  return APPLICATIONS.find((a) => a.id === id);
}

function getTargetTitle(
  targetType: AdTargetType,
  targetId: string
): string {
  if (targetType === "product") {
    return getProductById(targetId)?.title ?? targetId;
  }
  if (targetType === "shop") {
    return getBusinessProfileById(targetId)?.shopName ?? targetId;
  }
  return targetId;
}

export function createAdApplication(input: {
  applicantUserId: string;
  applicantNickname: string;
  targetType: AdTargetType;
  targetId: string;
  placement: AdPlacement;
  planId: string;
  paymentMethod: AdPaymentMethod;
  applicantMemo?: string;
}): AdApplication | null {
  const plan = getAdPlanById(input.planId);
  if (!plan) return null;
  const targetTitle = getTargetTitle(input.targetType, input.targetId);
  const now = new Date().toISOString();
  const app: AdApplication = {
    id: nextId(),
    applicantUserId: input.applicantUserId,
    applicantNickname: input.applicantNickname,
    targetType: input.targetType,
    targetId: input.targetId,
    targetTitle,
    placement: input.placement,
    planName: plan.name,
    durationDays: plan.durationDays,
    unitPrice: plan.price,
    totalPrice: plan.price,
    paymentMethod: input.paymentMethod,
    paymentStatus:
      input.paymentMethod === "manual_confirm" ? "waiting_confirm" : "unpaid",
    applicationStatus:
      input.paymentMethod === "manual_confirm"
        ? "waiting_payment"
        : "pending",
    startAt: "",
    endAt: "",
    createdAt: now,
    updatedAt: now,
    applicantMemo: input.applicantMemo,
  };
  APPLICATIONS.push(app);
  addAdApplicationLog(
    app.id,
    "apply",
    "user",
    input.applicantUserId,
    input.applicantNickname,
    "광고 신청"
  );
  return { ...app };
}

export function cancelAdApplication(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  const allowed = ["pending", "waiting_payment"].includes(app.applicationStatus);
  if (!allowed) return undefined;
  APPLICATIONS[idx] = {
    ...app,
    applicationStatus: "cancelled",
    updatedAt: new Date().toISOString(),
  };
  addAdApplicationLog(
    id,
    "cancel",
    "user",
    app.applicantUserId,
    app.applicantNickname,
    "신청 취소"
  );
  return { ...APPLICATIONS[idx] };
}

export function markAdApplicationPaid(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  APPLICATIONS[idx] = {
    ...app,
    paymentStatus: "paid",
    updatedAt: new Date().toISOString(),
  };
  addAdApplicationLog(
    id,
    "mark_paid",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    "입금 확인"
  );
  return { ...APPLICATIONS[idx] };
}

export function approveAdApplication(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  if (app.applicationStatus === "rejected" || app.applicationStatus === "cancelled")
    return undefined;
  APPLICATIONS[idx] = {
    ...app,
    applicationStatus: "approved",
    updatedAt: new Date().toISOString(),
  };
  addAdApplicationLog(
    id,
    "approve",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    "승인"
  );
  return { ...APPLICATIONS[idx] };
}

export function rejectAdApplication(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  APPLICATIONS[idx] = {
    ...app,
    applicationStatus: "rejected",
    updatedAt: new Date().toISOString(),
  };
  addAdApplicationLog(
    id,
    "reject",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    "반려"
  );
  return { ...APPLICATIONS[idx] };
}

export function activateAdApplication(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  if (app.applicationStatus !== "approved") return undefined;
  const startAt = new Date().toISOString();
  const endAt = new Date(
    Date.now() + app.durationDays * 86400000
  ).toISOString();
  APPLICATIONS[idx] = {
    ...app,
    applicationStatus: "active",
    startAt,
    endAt,
    updatedAt: new Date().toISOString(),
  };
  const existing = getPromotedItemByApplicationId(id);
  if (!existing) {
    createPromotedItem(
      id,
      app.targetType,
      app.targetId,
      app.targetTitle,
      app.placement,
      startAt,
      endAt,
      0
    );
  } else {
    setPromotedItemStatusByApplicationId(id, "active");
  }
  addAdApplicationLog(
    id,
    "activate",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    "노출 시작"
  );
  return { ...APPLICATIONS[idx] };
}

export function expireAdApplication(id: string): AdApplication | undefined {
  const idx = APPLICATIONS.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const app = APPLICATIONS[idx];
  APPLICATIONS[idx] = {
    ...app,
    applicationStatus: "expired",
    updatedAt: new Date().toISOString(),
  };
  setPromotedItemStatusByApplicationId(id, "expired");
  addAdApplicationLog(
    id,
    "expire",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    "노출 종료"
  );
  return { ...APPLICATIONS[idx] };
}

export function setAdApplicationAdminMemo(
  id: string,
  adminMemo: string
): void {
  const a = APPLICATIONS.find((x) => x.id === id);
  if (a) a.adminMemo = adminMemo;
}
