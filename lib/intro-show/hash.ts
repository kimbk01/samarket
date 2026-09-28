import { createHash } from "node:crypto";

export function sha256BufferHex(buf: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
