import type { IntroV3ProcessErrorCode } from "@/lib/startup/intro-v3/media-policy";

export type IntroV3MediaStatus = "pending" | "processing" | "ready" | "failed";

export type IntroV3DerivativeKind = "STILL_RUNTIME";

/** SOURCE row — original uploaded bytes. Never the layer binding. */
export type IntroV3MediaSource = {
  id: string;
  filename: string;
  mime: string;
  width: number | null;
  height: number | null;
  aspect: number | null;
  bytes: number | null;
  orientationDeg: number;
  storagePath: string;
  publicUrl: string | null;
  status: IntroV3MediaStatus;
  errorCode: IntroV3ProcessErrorCode | null;
  createdAt: string;
};

/** DERIVATIVE row — STILL_RUNTIME WebP. Independent of SOURCE and of Layer. */
export type IntroV3MediaDerivative = {
  id: string;
  sourceId: string;
  kind: IntroV3DerivativeKind;
  format: "webp";
  width: number;
  height: number;
  aspect: number | null;
  bytes: number | null;
  storagePath: string;
  publicUrl: string | null;
  status: IntroV3MediaStatus;
  revision: number;
};

/** Layer mediaRef points at the derivative id, never the SOURCE row. */
export type IntroV3MediaRef = {
  sourceId: string;
  derivativeId: string;
};

export type IntroV3LibraryIntent =
  | "ADD_IMAGE"
  | "ADD_LOGO"
  | "SET_BACKGROUND_IMAGE"
  | "ADD_MEDIA_DECORATION"
  | "REPLACE_MEDIA";

export type IntroV3LibrarySelection = {
  intent: IntroV3LibraryIntent;
  mediaRef: IntroV3MediaRef;
  source: IntroV3MediaSource;
  derivative: IntroV3MediaDerivative;
};

export function introV3MediaIsReady(input: {
  sourceStatus: IntroV3MediaStatus;
  derivativeStatus: IntroV3MediaStatus;
  sourcePersistable: boolean;
  derivativePersistable: boolean;
  derivativeExists: boolean;
}): boolean {
  return (
    input.sourceStatus === "ready" &&
    input.derivativeStatus === "ready" &&
    input.sourcePersistable &&
    input.derivativePersistable &&
    input.derivativeExists
  );
}
