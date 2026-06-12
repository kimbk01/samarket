/**
 * 31단계: 사용자 행동 이벤트 로그
 */

import type {
  UserBehaviorEvent,
  BehaviorEventType,
} from "@/lib/types/recommendation";

const EVENTS: UserBehaviorEvent[] = [
  {
    id: "ube-1",
    userId: "me",
    eventType: "product_view",
    productId: "1",
    targetId: null,
    sectionKey: null,
    query: null,
    category: "디지털/가전",
    region: "마닐라",
    city: "Malate",
    barangay: null,
    metadata: {},
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "ube-2",
    userId: "me",
    eventType: "favorite_add",
    productId: "3",
    targetId: "3",
    sectionKey: null,
    query: null,
    category: null,
    region: null,
    city: null,
    barangay: null,
    metadata: {},
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "ube-3",
    userId: "me",
    eventType: "chat_start",
    productId: "1",
    targetId: "room-1",
    sectionKey: null,
    query: null,
    category: null,
    region: null,
    city: null,
    barangay: null,
    metadata: {},
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "ube-4",
    userId: "me",
    eventType: "search_submit",
    productId: null,
    targetId: null,
    sectionKey: null,
    query: "아이폰",
    category: null,
    region: null,
    city: null,
    barangay: null,
    metadata: {},
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "ube-5",
    userId: "me",
    eventType: "recommendation_click",
    productId: "3",
    targetId: "3",
    sectionKey: "recent_view_based",
    query: null,
    category: null,
    region: null,
    city: null,
    barangay: null,
    metadata: {},
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

export interface LogEventPayload {
  userId: string;
  eventType: BehaviorEventType;
  productId?: string | null;
  targetId?: string | null;
  sectionKey?: string | null;
  query?: string | null;
  category?: string | null;
  region?: string | null;
  city?: string | null;
  barangay?: string | null;
  metadata?: Record<string, unknown>;
}

export function logEvent(payload: LogEventPayload): UserBehaviorEvent {
  const event: UserBehaviorEvent = {
    id: `ube-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId: payload.userId,
    eventType: payload.eventType,
    productId: payload.productId ?? null,
    targetId: payload.targetId ?? null,
    sectionKey: payload.sectionKey ?? null,
    query: payload.query ?? null,
    category: payload.category ?? null,
    region: payload.region ?? null,
    city: payload.city ?? null,
    barangay: payload.barangay ?? null,
    metadata: payload.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
  EVENTS.unshift(event);
  return event;
}

export interface BehaviorEventFilters {
  userId?: string;
  eventType?: BehaviorEventType;
  sectionKey?: string;
  productId?: string;
  from?: string;
  to?: string;
}

export function getBehaviorEvents(filters: BehaviorEventFilters = {}): UserBehaviorEvent[] {
  let list = [...EVENTS];
  if (filters.userId) list = list.filter((e) => e.userId === filters.userId);
  if (filters.eventType) list = list.filter((e) => e.eventType === filters.eventType);
  if (filters.sectionKey) list = list.filter((e) => e.sectionKey === filters.sectionKey);
  if (filters.productId) list = list.filter((e) => e.productId === filters.productId);
  if (filters.from) {
    const t = new Date(filters.from).getTime();
    list = list.filter((e) => new Date(e.createdAt).getTime() >= t);
  }
  if (filters.to) {
    const t = new Date(filters.to).getTime();
    list = list.filter((e) => new Date(e.createdAt).getTime() <= t);
  }
  return list;
}
