declare module "heic-convert" {
  type HeicConvertInput = {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  export default function convert(input: HeicConvertInput): Promise<ArrayBuffer>;
}
