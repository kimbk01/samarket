declare module "omggif" {
  export class GifWriter {
    constructor(
      buf: Buffer,
      width: number,
      height: number,
      opts?: { loop?: number },
    );
    addFrame(
      x: number,
      y: number,
      w: number,
      h: number,
      indexed: Uint8Array,
      opts: {
        palette: number[];
        delay: number;
        transparent?: number;
        disposal: number;
      },
    ): void;
    end(): number;
  }

  export class GifReader {
    constructor(buf: Buffer);
    width: number;
    height: number;
    numFrames(): number;
  }
}
