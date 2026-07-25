import { PhilifeHomeFeedPage } from "@/components/community/PhilifeHomeFeedPage";

/**
 * App home (`/`) — `(main)` 셸 안에서 Philife 피드를 직접 렌더.
 * CONTRACT: `/` → `/philife` HTTP redirect 금지 (Cold Boot Shell-First).
 * `/philife` 와 동일 피드 엔트리 (`PhilifeHomeFeedPage`).
 */
export default function HomePage() {
  return <PhilifeHomeFeedPage />;
}
