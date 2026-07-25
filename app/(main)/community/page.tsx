import { PhilifeHomeFeedPage } from "@/components/community/PhilifeHomeFeedPage";

/** 레거시 `/community` — redirect 없이 Philife 홈 직접 렌더 (Cold Boot hop 금지) */
export default function CommunityPage() {
  return <PhilifeHomeFeedPage />;
}
