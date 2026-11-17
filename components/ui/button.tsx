import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const baseButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[transform,box-shadow,filter,border-color,color] duration-200 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-primary-foreground font-bold shadow-button hover:shadow-button-hover hover:brightness-110 active:shadow-button-press",
        secondary:
          "border-[1.5px] border-border-input bg-card text-button-ink shadow-white hover:border-border-strong",
        outline:
          "border-[1.5px] border-border-input bg-card text-button-ink shadow-white hover:border-border-strong",
        ghost: "text-accent hover:bg-elevated hover:text-accent-strong",
        danger:
          "border-[1.5px] border-danger-border bg-card text-danger shadow-white hover:border-danger",
        link: "text-accent underline-offset-4 hover:underline h-auto p-0 shadow-none motion-safe:hover:translate-y-0",
      },
      size: {
        sm: "h-9 px-3.5 text-xs",
        md: "h-11 px-5",
        lg: "h-14 px-7 text-base rounded-lg",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonVariantProps = VariantProps<typeof baseButtonVariants>;

/**
 * Merged with tailwind-merge so a variant's overrides (e.g. the link variant's
 * h-auto p-0) beat the size classes instead of racing them in the stylesheet.
 */
const buttonVariants = (
  props?: ButtonVariantProps & { className?: string },
) => {
  const { className, ...variants } = props ?? {};
  return cn(baseButtonVariants(variants), className);
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
