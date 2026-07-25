import { MyContent } from "../my/MyContent";

/**
 * `/mypage` — Cold Boot / Bottom Tab Cache-First.
 * DO NOT: blocking RSC server shell await — first paint 를 RSC 에 묶지 않음.
 * Snapshot: `useMypageHubModel` persistent/session peek → background load.
 */
export default function MypagePage() {
  return <MyContent />;
}
