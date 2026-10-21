import logoUrl from "@/assets/createtor-logo.png";
import logoWhiteUrl from "@/assets/createtor_logo-web-white.png";
import iconUrl from "@/assets/createtor-icon.png";
import { cn } from "@/lib/utils";

type LogoVariant = "color" | "white";

/**
 * Createtor wordmark. Use `variant="white"` on dark surfaces (sidebars, the
 * footer); the default colour lockup is for light backgrounds.
 */
export function Logo({
  className,
  variant = "color",
  compact = false,
}: {
  className?: string;
  variant?: LogoVariant;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <img
        src={iconUrl}
        alt="Createtor"
        width={250}
        height={250}
        decoding="async"
        className={cn("size-8 rounded-lg object-contain", className)}
      />
    );
  }

  return (
    <span className={cn("flex items-center", className)}>
      <img
        src={variant === "white" ? logoWhiteUrl : logoUrl}
        alt="Createtor"
        width={967}
        height={228}
        decoding="async"
        className="h-8 w-auto max-w-[12rem] shrink-0 object-contain"
      />
    </span>
  );
}
