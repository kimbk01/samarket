/**
 * Extended profile (jobs/exchange) contributes validation + payload + extras UI only.
 * Common chrome state/widgets and createPost / updateTradePost stay in TradeWriteForm.
 */
import type { ReactNode } from "react";
import type { ImageUploadItem } from "@/components/write/shared/ImageUploader";
import type { TradeWriteAddressSsotSnapshot } from "@/components/write/shared/TradeDefaultLocationBlock";
import type { CreatePostPayload } from "@/lib/posts/types";
import type { TradeMeetSpotValue } from "@/lib/posts/trade-meet-spot-types";

export type TradeExtendedCreatePayload = Extract<CreatePostPayload, { type: "trade" }>;

export type TradeWriteChromeState = {
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  descriptionAppend: string;
  setDescriptionAppend: (value: string) => void;
  images: ImageUploadItem[];
  setImages: (value: ImageUploadItem[] | ((prev: ImageUploadItem[]) => ImageUploadItem[])) => void;
  region: string;
  city: string;
  setRegion: (value: string) => void;
  setCity: (value: string) => void;
  syncTradeRegionCity: (regionId: string, cityId: string) => void;
  tradeTopicChildId: string;
  setTradeTopicChildId: (value: string) => void;
  tradeMeetSpot: TradeMeetSpotValue | null;
  setTradeMeetSpot: (value: TradeMeetSpotValue | null) => void;
  tradeAddressSsot: TradeWriteAddressSsotSnapshot;
  setTradeAddressSsot: (value: TradeWriteAddressSsotSnapshot) => void;
  setChromeErrors: (errors: Record<string, string>) => void;
};

export type TradeWriteChromeSlots = {
  images: ReactNode;
  topic: ReactNode;
  location: ReactNode;
  title: ReactNode;
  description: ReactNode;
};

export type TradeExtendedWriteController = {
  validate: () => boolean;
  getImages: () => ImageUploadItem[];
  buildPayload: (imageUrls: string[] | undefined) => TradeExtendedCreatePayload;
  getDescriptionAppend: () => string | undefined;
  clearStagingAfterSuccess: () => void;
  getSubmitErrorFallbackPath: () => string;
  persistStagingIfNeeded: (opts?: { markRestoreAfterSubflow?: boolean }) => Promise<boolean>;
};
