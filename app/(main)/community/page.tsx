import { CommunityHomeSurface } from "@/components/community/CommunityHomeSurface";
import { MainHubKeepAliveSlot } from "@/components/layout/MainHubKeepAlive";

/** 레거시 `/community` — redirect 없이 Community home surface 직접 렌더 (Cold Boot hop 금지) */
export default function CommunityPage() {
  return (
    <MainHubKeepAliveSlot hubId="community">
      <CommunityHomeSurface />
    </MainHubKeepAliveSlot>
  );
}
