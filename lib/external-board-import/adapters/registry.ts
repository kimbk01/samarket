import { dotTourismDestinationAdapter } from "@/lib/external-board-import/adapters/dot-tourism";
import { helloCebuExternalBoardAdapter } from "@/lib/external-board-import/adapters/hello-cebu";
import { manilaSeoulExternalBoardAdapter } from "@/lib/external-board-import/adapters/manilaseoul";
import { philsamoExternalBoardAdapter } from "@/lib/external-board-import/adapters/philsamo";
import { pinoyForumExternalBoardAdapter } from "@/lib/external-board-import/adapters/pinoy-forum";
import {
  FIXTURE_ADAPTER_HOST,
  fixtureExternalBoardAdapter,
  type ExternalBoardAdapter,
  type ExternalBoardAdapterContext,
} from "@/lib/external-board-import/adapters/types";
import { deriveSourceBoardIdentity } from "@/lib/external-board-import/identity/source-board-identity";

/**
 * Real adapters first; fixture last for local-only host.
 * Fixture PASS is never Production acceptance.
 */
const ADAPTERS: ExternalBoardAdapter[] = [
  manilaSeoulExternalBoardAdapter,
  pinoyForumExternalBoardAdapter,
  philsamoExternalBoardAdapter,
  helloCebuExternalBoardAdapter,
  dotTourismDestinationAdapter,
  fixtureExternalBoardAdapter,
];
export function listExternalBoardAdapters(): readonly ExternalBoardAdapter[] {
  return ADAPTERS;
}

export function resolveExternalBoardAdapter(sourceUrl: string): {
  ctx: ExternalBoardAdapterContext;
  adapter: ExternalBoardAdapter | null;
} {
  const identity = deriveSourceBoardIdentity(sourceUrl);
  if (!identity) {
    return {
      ctx: { sourceUrl, siteKey: "", boardKey: "" },
      adapter: null,
    };
  }
  const ctx: ExternalBoardAdapterContext = {
    sourceUrl: identity.canonicalUrl,
    siteKey: identity.siteKey,
    boardKey: identity.boardKey,
  };
  const adapter = ADAPTERS.find((a) => a.matches(ctx)) ?? null;
  return { ctx, adapter };
}

export function isFixtureExternalBoardUrl(url: string): boolean {
  return String(url ?? "").includes(FIXTURE_ADAPTER_HOST);
}

export { FIXTURE_ADAPTER_HOST, fixtureExternalBoardAdapter };
