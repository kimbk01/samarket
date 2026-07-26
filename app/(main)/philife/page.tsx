import { CommunityHomeSurface } from "@/components/community/CommunityHomeSurface";

type PhilifePageProps = {
  searchParams: Promise<{ category?: string; sort?: string }>;
};

/**
 * `/philife` — 하단 탭·딥링크 홈.
 * AUTHORITY: `CommunityHomeSurface` only (same as `/` · `/community`).
 * Cold Boot: Suspense/RSC seed 로 첫 paint 를 막지 않는다.
 */
export default function PhilifePage(_props: PhilifePageProps) {
  return <CommunityHomeSurface />;
}
