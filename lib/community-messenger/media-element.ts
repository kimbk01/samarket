export function bindMediaStreamToElement(
  node: HTMLMediaElement | null,
  stream: MediaStream | null,
  options?: { muted?: boolean }
): void {
  if (!node) return;
  if (node.srcObject !== stream) {
    node.srcObject = stream;
  }
  node.autoplay = true;
  if ("playsInline" in node) {
    (node as HTMLVideoElement).playsInline = true;
  }
  if (typeof options?.muted === "boolean") {
    node.muted = options.muted;
  }
  if (!stream) return;

  const tryPlay = () => {
    const playResult = node.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch(() => {
        /* iOS Safari may require another gesture; keep element bound */
      });
    }
  };

  tryPlay();
  node.onloadedmetadata = () => {
    tryPlay();
  };
  node.oncanplay = () => {
    tryPlay();
  };
}
