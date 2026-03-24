/**
 * 22단계: 유료 노출 상품 mock (approved/activate 시 생성)
 */

import type { PromotedItem, PromotedItemStatus } from "@/lib/types/ad-application";

const ITEMS: PromotedItem[] = [
  {
    id: "pi-1",
    adApplicationId: "ad-1",
    targetType: "product",
    targetId: "1",
    targetTitle: "아이폰 14 Pro 256GB",
    placement: "home_top",
    status: "active",
    startAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    priority: 0,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

function nextId(): string {
  const nums = ITEMS.map((p) =>
    parseInt(p.id.replace("pi-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pi-${max + 1}`;
}

export function createPromotedItem(
  adApplicationId: string,
  targetType: PromotedItem["targetType"],
  targetId: string,
  targetTitle: string,
  placement: PromotedItem["placement"],
  startAt: string,
  endAt: string,
  priority: number
): PromotedItem {
  const item: PromotedItem = {
    id: nextId(),
    adApplicationId,
    targetType,
    targetId,
    targetTitle,
    placement,
    status: "scheduled",
    startAt,
    endAt,
    priority,
    createdAt: new Date().toISOString(),
  };
  ITEMS.push(item);
  return { ...item };
}

export function getPromotedItemByApplicationId(
  adApplicationId: string
): PromotedItem | undefined {
  return ITEMS.find((p) => p.adApplicationId === adApplicationId);
}

export function getPromotedItems(): PromotedItem[] {
  return ITEMS.map((p) => ({ ...p }));
}

export function setPromotedItemStatus(
  id: string,
  status: PromotedItemStatus
): void {
  const p = ITEMS.find((x) => x.id === id);
  if (p) p.status = status;
}

export function setPromotedItemStatusByApplicationId(
  adApplicationId: string,
  status: PromotedItemStatus
): void {
  const p = ITEMS.find((x) => x.adApplicationId === adApplicationId);
  if (p) p.status = status;
}
