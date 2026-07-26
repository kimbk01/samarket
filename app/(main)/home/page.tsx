import { CommunityHomeSurface } from "@/components/community/CommunityHomeSurface";

/**
 * CI `verify:routes` 가 요구하는 `app/(main)/home` 세그먼트.
 * Cold Boot: HTTP redirect 금지 — `/`·`/philife`·`/community` 와 동일 Authority.
 */
export default function HomeSegmentPage() {
  return <CommunityHomeSurface />;
}
