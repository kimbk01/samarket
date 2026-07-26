import { CommunityHomeSurface } from "@/components/community/CommunityHomeSurface";

/**
 * App home (`/`) — `(main)` 셸 안에서 Community home surface 직접 렌더.
 * CONTRACT: `/` → `/philife` HTTP redirect 금지 (Cold Boot Shell-First).
 * AUTHORITY: `CommunityHomeSurface` only (same as `/philife` · `/community`).
 */
export default function HomePage() {
  return <CommunityHomeSurface />;
}
