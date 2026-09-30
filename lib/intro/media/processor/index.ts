import { IdentifiedFormat, identifySourceBytes } from "../identify";
import { processGifB2, type GifProcessResult } from "./gif-b2";
import { processStaticImage, type StaticProcessResult } from "./static";
import { processMp4Video, type VideoProcessResult } from "./video";

export type ProcessSourceResult =
  | GifProcessResult
  | StaticProcessResult
  | VideoProcessResult;

export async function processSourceBytes(
  srcBuf: Buffer,
): Promise<ProcessSourceResult> {
  const identified = await identifySourceBytes(srcBuf);
  if (identified.format === IdentifiedFormat.GIF) {
    return processGifB2(srcBuf);
  }
  if (identified.format === IdentifiedFormat.MP4) {
    return processMp4Video(srcBuf);
  }
  return processStaticImage(srcBuf, identified.format);
}

export { processGifB2, validateCanonicalAnimatedGifPlayback } from "./gif-b2";
export { processStaticImage } from "./static";
