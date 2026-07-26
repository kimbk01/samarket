import { CommunityUiScope } from "@/components/community/CommunityUiScope";

/**
 * Legacy `/community/*` — same Community UI token scope as `/` · `/philife`
 * (DO NOT: sam-domain-shell alone without `data-community-ui`).
 */
export default function CommunityRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <CommunityUiScope>{children}</CommunityUiScope>;
}
