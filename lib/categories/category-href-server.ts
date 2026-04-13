import type { CategoryWithSettings } from "./types";
import { encodedTradeMarketSegment } from "./tradeMarketPath";

/** `getCategoryHref` 와 동일 경로 — 서버 `redirect()` 용 (클라이언트 전용 모듈에 의존하지 않음) */
export function getCategoryPathForRedirect(category: CategoryWithSettings): string {
  const seg = encodedTradeMarketSegment(category);
  switch (category.type) {
    case "trade":
      return `/market/${seg}`;
    case "community":
      return "/community";
    case "service":
      return `/services/${seg}`;
    case "feature":
      return `/features/${seg}`;
    default:
      return `/market/${seg}`;
  }
}
