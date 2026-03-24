/**
 * 23단계: 포인트 충전 신청 mock
 */

import type {
  PointChargeRequest,
  PointChargeRequestStatus,
  PointPaymentMethod,
} from "@/lib/types/point";
import { getPointPlanById } from "./mock-point-plans";
import { appendPointLedger } from "./mock-point-ledger";
import { addPointActionLog } from "./mock-point-action-logs";

const REQUESTS: PointChargeRequest[] = [
  {
    id: "pcr-1",
    userId: "me",
    userNickname: "KASAMA",
    planId: "pp-2",
    planName: "5,000P (+5% 보너스)",
    paymentMethod: "manual_confirm",
    paymentAmount: 5000,
    pointAmount: 5250,
    requestStatus: "approved",
    depositorName: "홍길동",
    receiptImageUrl: "",
    requestedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "pcr-2",
    userId: "me",
    userNickname: "KASAMA",
    planId: "pp-1",
    planName: "1,000P",
    paymentMethod: "bank_transfer",
    paymentAmount: 1000,
    pointAmount: 1000,
    requestStatus: "waiting_confirm",
    depositorName: "",
    receiptImageUrl: "",
    requestedAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    userMemo: "입금 예정",
  },
];

const MOCK_ADMIN = { id: "admin-1", nickname: "관리자" };
export const CURRENT_USER_ID = "me";
const MOCK_NICKNAME = "KASAMA";

function nextId(): string {
  const nums = REQUESTS.map((r) =>
    parseInt(r.id.replace("pcr-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pcr-${max + 1}`;
}

export function getPointChargeRequestsByUser(
  userId: string
): PointChargeRequest[] {
  return REQUESTS.filter((r) => r.userId === userId)
    .map((r) => ({ ...r }))
    .sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );
}

export function getPointChargeRequestsForAdmin(): PointChargeRequest[] {
  return REQUESTS.map((r) => ({ ...r })).sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
  );
}

export function getPointChargeRequestById(
  id: string
): PointChargeRequest | undefined {
  return REQUESTS.find((r) => r.id === id);
}

export function createPointChargeRequest(input: {
  userId: string;
  userNickname: string;
  planId: string;
  paymentMethod: PointPaymentMethod;
  depositorName?: string;
  userMemo?: string;
}): PointChargeRequest | null {
  const plan = getPointPlanById(input.planId);
  if (!plan) return null;
  const pointAmount = plan.pointAmount + (plan.bonusPointAmount ?? 0);
  const now = new Date().toISOString();
  const status: PointChargeRequestStatus =
    input.paymentMethod === "manual_confirm" ? "waiting_confirm" : "pending";
  const req: PointChargeRequest = {
    id: nextId(),
    userId: input.userId,
    userNickname: input.userNickname,
    planId: plan.id,
    planName: plan.name,
    paymentMethod: input.paymentMethod,
    paymentAmount: plan.paymentAmount,
    pointAmount,
    requestStatus: status,
    depositorName: input.depositorName ?? "",
    receiptImageUrl: "",
    requestedAt: now,
    updatedAt: now,
    userMemo: input.userMemo,
  };
  REQUESTS.push(req);
  addPointActionLog(
    "request_charge",
    "user",
    input.userId,
    input.userNickname,
    input.userId,
    input.userNickname,
    req.id,
    "포인트 충전 신청"
  );
  return { ...req };
}

export function cancelPointChargeRequest(
  id: string
): PointChargeRequest | undefined {
  const idx = REQUESTS.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const r = REQUESTS[idx];
  if (!["pending", "waiting_confirm"].includes(r.requestStatus))
    return undefined;
  REQUESTS[idx] = { ...r, requestStatus: "cancelled", updatedAt: new Date().toISOString() };
  addPointActionLog(
    "reject_charge",
    "user",
    r.userId,
    r.userNickname,
    r.userId,
    r.userNickname,
    id,
    "신청 취소"
  );
  return { ...REQUESTS[idx] };
}

export function approvePointChargeRequest(
  id: string
): PointChargeRequest | undefined {
  const idx = REQUESTS.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const r = REQUESTS[idx];
  if (r.requestStatus === "approved" || r.requestStatus === "rejected")
    return undefined;
  const now = new Date().toISOString();
  REQUESTS[idx] = { ...r, requestStatus: "approved", updatedAt: now };
  appendPointLedger(
    r.userId,
    r.userNickname,
    "charge",
    r.pointAmount,
    "point_charge",
    id,
    `충전 승인: ${r.planName}`,
    "admin"
  );
  addPointActionLog(
    "approve_charge",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    r.userId,
    r.userNickname,
    id,
    "충전 승인"
  );
  return { ...REQUESTS[idx] };
}

export function rejectPointChargeRequest(
  id: string
): PointChargeRequest | undefined {
  const idx = REQUESTS.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const r = REQUESTS[idx];
  REQUESTS[idx] = {
    ...r,
    requestStatus: "rejected",
    updatedAt: new Date().toISOString(),
  };
  addPointActionLog(
    "reject_charge",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    r.userId,
    r.userNickname,
    id,
    "충전 반려"
  );
  return { ...REQUESTS[idx] };
}

export function holdPointChargeRequest(
  id: string
): PointChargeRequest | undefined {
  const idx = REQUESTS.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const r = REQUESTS[idx];
  if (r.requestStatus === "approved" || r.requestStatus === "rejected")
    return undefined;
  REQUESTS[idx] = {
    ...r,
    requestStatus: "on_hold",
    updatedAt: new Date().toISOString(),
  };
  addPointActionLog(
    "hold_charge",
    "admin",
    MOCK_ADMIN.id,
    MOCK_ADMIN.nickname,
    r.userId,
    r.userNickname,
    id,
    "보류"
  );
  return { ...REQUESTS[idx] };
}

export function setPointChargeRequestAdminMemo(
  id: string,
  adminMemo: string
): void {
  const r = REQUESTS.find((x) => x.id === id);
  if (r) r.adminMemo = adminMemo;
}
