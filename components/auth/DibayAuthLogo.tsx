import Image from "next/image";

export const DIBAY_AUTH_LOGO_SRC = "/images/brand/dibay-auth-logo.png";

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
      className={`rounded-xl object-cover ${className}`.trim()}
      priority
    />
  );
}
