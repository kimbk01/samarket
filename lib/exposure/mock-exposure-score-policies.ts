/**
 * 28단계: 노출 점수 정책 mock (surface별 가중치)
 */

import type { ExposureScorePolicy, ExposureSurface } from "@/lib/types/exposure";
import { addExposurePolicyLog } from "./mock-exposure-policy-logs";

const POLICIES: ExposureScorePolicy[] = [
  {
    id: "esp-home",
    surface: "home",
    isActive: true,
    policyName: "홈 상단 정책",
    latestWeight: 1.0,
    popularWeight: 0.8,
    nearbyWeight: 0.6,
    premiumBoostWeight: 10,
    businessBoostWeight: 5,
    adBoostWeight: 20,
    pointPromotionBoostWeight: 15,
    bumpBoostWeight: 8,
    exactRegionMatchWeight: 12,
    sameCityWeight: 6,
    sameBarangayWeight: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "홈 피드 노출",
  },
  {
    id: "esp-search",
    surface: "search",
    isActive: true,
    policyName: "검색 결과 정책",
    latestWeight: 1.0,
    popularWeight: 0.9,
    nearbyWeight: 0.5,
    premiumBoostWeight: 8,
    businessBoostWeight: 4,
    adBoostWeight: 18,
    pointPromotionBoostWeight: 12,
    bumpBoostWeight: 6,
    exactRegionMatchWeight: 10,
    sameCityWeight: 5,
    sameBarangayWeight: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "검색 상단 노출",
  },
  {
    id: "esp-shop",
    surface: "shop_featured",
    isActive: true,
    policyName: "상점 featured 정책",
    latestWeight: 0.8,
    popularWeight: 0.7,
    nearbyWeight: 0.3,
    premiumBoostWeight: 5,
    businessBoostWeight: 15,
    adBoostWeight: 10,
    pointPromotionBoostWeight: 10,
    bumpBoostWeight: 5,
    exactRegionMatchWeight: 6,
    sameCityWeight: 3,
    sameBarangayWeight: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adminMemo: "상점 추천 영역",
  },
];

export function getExposureScorePolicies(): ExposureScorePolicy[] {
  return [...POLICIES];
}

export function getExposureScorePolicyBySurface(
  surface: ExposureSurface
): ExposureScorePolicy | undefined {
  return POLICIES.find((p) => p.surface === surface && p.isActive);
}

export function getExposureScorePolicyById(
  id: string
): ExposureScorePolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function saveExposureScorePolicy(
  input: Omit<ExposureScorePolicy, "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  }
): ExposureScorePolicy {
  const now = new Date().toISOString();
  const existing = input.id ? POLICIES.find((p) => p.id === input.id) : null;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    addExposurePolicyLog(existing.id, existing.surface, "update", "정책 수정");
    return { ...existing };
  }
  const policy: ExposureScorePolicy = {
    ...input,
    id: input.id ?? `esp-${input.surface}-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  POLICIES.push(policy);
  addExposurePolicyLog(policy.id, policy.surface, "create", "정책 생성");
  return { ...policy };
}

export function setExposureScorePolicyActive(
  id: string,
  isActive: boolean
): ExposureScorePolicy | undefined {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) return undefined;
  p.isActive = isActive;
  p.updatedAt = new Date().toISOString();
  addExposurePolicyLog(
    id,
    p.surface,
    isActive ? "activate" : "deactivate",
    isActive ? "활성화" : "비활성화"
  );
  return { ...p };
}
