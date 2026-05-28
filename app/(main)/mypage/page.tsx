import { MyContent } from "../my/MyContent";

/**
 * 하단 탭 루트: RSC await/Suspense fallback 이 탭 push 이후 카드형 로딩으로 튀지 않게,
 * 클라이언트 허브가 sessionStorage seed 후 백그라운드 fetch 로 채운다.
 */
export default function MypagePage() {
  return <MyContent />;
}
