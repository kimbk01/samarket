import { PlatformEventBoardClient } from "@/components/platform-events/PlatformEventBoardClient";
import { parsePlatformEventBoardState } from "@/lib/platform-events/board";

/** EVT-01 — Event board (/events): 진행 중 / 종료 tabs. */
export default async function PlatformEventBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  return <PlatformEventBoardClient initialState={parsePlatformEventBoardState(tab)} />;
}
