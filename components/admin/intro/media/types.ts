/**
 * Phase 4 — operator Media Library shared types.
 * IMAGE and LOGO share this single Media authority.
 */

export type IntroMediaOperatorStatus =
  | "UPLOADING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "OTHER";

export type IntroMediaListItemDto = {
  mediaId: string;
  mediaRefId: string;
  status: string;
  mediaKind: string;
  originalName: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  runtimeArtifactId: string | null;
  runtimeFormat: string | null;
  animated: boolean;
  failureCode: string | null;
  failureMessage: string | null;
  updatedAt: string;
  createdAt: string;
  mediaOrigin?: "OPERATOR" | "QA_EVIDENCE" | "SYSTEM";
};

export type IntroMediaPickerContext = "IMAGE" | "LOGO" | "GIF" | "ANY";

export type IntroMediaPickerResult = {
  mediaRefId: string;
  mediaId: string;
};

export const ACCEPTED_INTRO_MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

export const ACCEPTED_INTRO_MEDIA_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
