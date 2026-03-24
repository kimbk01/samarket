/**
 * 57단계: 느린 쿼리 mock
 */

import type { SlowQuery } from "@/lib/types/performance";

const now = new Date().toISOString();

const QUERIES: SlowQuery[] = [
  { id: "sq-1", queryName: "getProductsWithUser", duration: 1200, route: "/products", detectedAt: new Date(Date.now() - 7200000).toISOString() },
  { id: "sq-2", queryName: "getAdminDashboardStats", duration: 850, route: "/admin/dashboard", detectedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "sq-3", queryName: "listChatsWithMessages", duration: 650, route: "/chats", detectedAt: now },
];

export function getSlowQueries(filters?: { route?: string }): SlowQuery[] {
  let list = [...QUERIES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.route) list = list.filter((q) => q.route === filters.route);
  return list;
}
