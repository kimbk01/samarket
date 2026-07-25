import { PhilifeHomeFeedPage } from "@/components/community/PhilifeHomeFeedPage";

/**
 * CI `verify:routes` 가 요구하는 `app/(main)/home` 세그먼트.
 * Cold Boot: HTTP redirect 금지 — `/`·`/philife` 와 동일 피드 직접 렌더.
 */
export default function HomeSegmentPage() {
  return <PhilifeHomeFeedPage />;
}
