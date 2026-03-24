/**
 * 20단계: 배너 변경 이력 (mock-admin-banners와 동일 저장소 사용)
 */

import type { BannerChangeLog } from "@/lib/types/admin-banner";
import { getBannerChangeLogs as getLogs } from "./mock-admin-banners";

export function getBannerChangeLogs(bannerId: string): BannerChangeLog[] {
  return getLogs(bannerId);
}
