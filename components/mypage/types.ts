import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import type { ProfileRow } from "@/lib/profile/types";

export type MyPageTabId =
  | "account"
  | "trade"
  | "community"
  | "store"
  | "messenger"
  | "settings";

export type MyPageOverviewCounts = {
  purchases: number | null;
  sales: number | null;
  storeAttention: number | null;
};

export type MyPageConsoleProps = {
  profile: ProfileRow;
  mannerScore: number;
  isBusinessMember: boolean;
  hasOwnerStore: boolean;
  ownerHubStoreId?: string | null;
  isAdmin: boolean;
  addressDefaults: AddressDefaultsFlags;
  neighborhoodFromLife: LifeDefaultLocationSummary | null;
  overviewCounts: MyPageOverviewCounts;
  favoriteBadge: string | null;
  notificationBadge: string | null;
  storeAttentionSummary: string | null;
};
