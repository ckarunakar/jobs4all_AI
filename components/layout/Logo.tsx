import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/** ITJobCafé logo image. Callers wrap it in a link when needed. */
export function Logo({
  height = 52,
  className,
  preload = false,
}: {
  height?: number;
  className?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src="/brand/itjobcafe-logo.png"
      alt="ITJobCafé"
      width={Math.round((height * 230) / 64)}
      height={height}
      preload={preload}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}
