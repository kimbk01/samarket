/**
 * MP4 runtime: pass-through source bytes (no re-encode).
 * Optional first-frame JPEG via ffmpeg is not persisted — preview uses <video>.
 */

import { MediaFailureCategory, MediaPipelineError } from "../failure";
import { identifySourceBytes, IdentifiedFormat } from "../identify";
import { ffmpegFirstFrameJpeg } from "../ffprobe-optional";
import { PROCESS_RECIPE } from "../paths";

export type VideoProcessResult = {
  bytes: Buffer;
  mime: "video/mp4";
  format: "MP4";
  width: number;
  height: number;
  byteLength: number;
  processRecipeVersion: typeof PROCESS_RECIPE.MP4_PASSTHROUGH_V1;
  animationMetadata: {
    animated: false;
    hasVideo: true;
    thumbnailGenerated: boolean;
  };
};

export async function processMp4Video(srcBuf: Buffer): Promise<VideoProcessResult> {
  const identified = await identifySourceBytes(srcBuf);
  if (identified.format !== IdentifiedFormat.MP4) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      "MP4 processor requires MP4 source",
    );
  }

  // Best-effort thumbnail probe (not stored separately).
  const thumb = ffmpegFirstFrameJpeg(srcBuf);

  return {
    bytes: srcBuf,
    mime: "video/mp4",
    format: "MP4",
    width: identified.width,
    height: identified.height,
    byteLength: srcBuf.byteLength,
    processRecipeVersion: PROCESS_RECIPE.MP4_PASSTHROUGH_V1,
    animationMetadata: {
      animated: false,
      hasVideo: true,
      thumbnailGenerated: thumb != null && thumb.length > 0,
    },
  };
}
