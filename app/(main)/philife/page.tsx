import { PhilifeHomeFeedPage } from "@/components/community/PhilifeHomeFeedPage";

type PhilifePageProps = {
  searchParams: Promise<{ category?: string; sort?: string }>;
};

/**
 * `/philife` — 하단 탭·딥링크 홈.
 * Cold Boot: Suspense/RSC seed 로 첫 paint 를 막지 않는다.
 * (`searchParams` 는 클라 `useSearchParams` 가 URL에서 읽음 — 서버 await 없음)
 */
export default function PhilifePage(_props: PhilifePageProps) {
  return <PhilifeHomeFeedPage />;
}
