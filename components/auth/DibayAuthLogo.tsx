import Image from "next/image";
import {
  DIBAY_AUTH_LOGO_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";

export const DIBAY_AUTH_LOGO_SRC = dibayBrandAssetUrl(DIBAY_AUTH_LOGO_PATH);

type Props = {
  className?: string;
  size?: number;
};

export function DibayAuthLogo({ className = "", size = 56 }: Props) {
  return (
    <Image
      src={DIBAY_AUTH_LOGO_SRC}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={`rounded-xl object-contain ${className}`.trim()}
      priority
    />
  );
}
