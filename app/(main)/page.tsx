import { HomeSurface } from "@/components/home-hub/HomeSurface";
import { MainHubKeepAliveSlot } from "@/components/layout/MainHubKeepAlive";

/**
 * App home (`/`) — 앱 홈 (Owner 「구현 시작」 2026-11-09). 커뮤니티 피드는 `/philife`.
 * CONTRACT: HTTP redirect 금지 (Cold Boot Shell-First). AUTHORITY: `HomeSurface` only (same as `/home`).
 */
export default function HomePage() {
  return (
    <MainHubKeepAliveSlot hubId="home">
      <HomeSurface />
    </MainHubKeepAliveSlot>
  );
}
