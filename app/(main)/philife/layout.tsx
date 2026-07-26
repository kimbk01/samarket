import { CommunityUiScope } from "@/components/community/CommunityUiScope";

/**
 * `/philife/*` detail·subroutes share the same Community token scope as home
 * (`CommunityUiScope` / `PhilifeFeedClientEntry`).
 */
export default function PhilifeLayout({ children }: { children: React.ReactNode }) {
  return <CommunityUiScope>{children}</CommunityUiScope>;
}
