import { IdentifiedFormat, identifySourceBytes } from "../identify";
import { processGifB2, type GifProcessResult } from "./gif-b2";
import { processStaticImage, type StaticProcessResult } from "./static";

export type ProcessSourceResult = GifProcessResult | StaticProcessResult;

export async function processSourceBytes(
  srcBuf: Buffer,
): Promise<ProcessSourceResult> {
  const identified = await identifySourceBytes(srcBuf);
  if (identified.format === IdentifiedFormat.GIF) {
    return processGifB2(srcBuf);
  }
  return processStaticImage(srcBuf, identified.format);
}

export { processGifB2, validateCanonicalAnimatedGifPlayback } from "./gif-b2";
export { processStaticImage } from "./static";
