import type { OpeningScene } from "@/lib/opening-show/document";

export const OPENING_RUNTIME_SCENE_DURATION_MS = 2400;

export type OpeningRuntimeAsset = {
  mediaId: string;
  url: string;
  sha256: string;
  bytes: number;
  mime: "image/webp";
};

export type OpeningRuntimeManifest = {
  revisionId: string;
  revisionNumber: number;
  documentVersion: number;
  sceneDurationMs: number;
  checksum: string;
  scenes: OpeningScene[];
  assets: OpeningRuntimeAsset[];
};

export type OpeningRevisionPayload = {
  documentVersion: number;
  sceneDurationMs: number;
  checksum: string;
  scenes: OpeningScene[];
  assets: OpeningRuntimeAsset[];
};
