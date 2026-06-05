import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "sage" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-blush";

const sizes: Record<Size, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-6 py-2.5 text-sm",
};

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-rose",
  secondary:
    "border border-line bg-surface text-ink shadow-[var(--shadow-card)] hover:border-rose-soft hover:text-rose",
  danger: "bg-danger text-paper hover:opacity-90",
  sage: "bg-sage text-paper hover:opacity-90",
  ghost: "text-ink-soft hover:text-ink",
};

/** Compose the button skin for non-button elements (e.g. a Link styled as a button). */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${sizes[size]} ${variants[variant]} ${extra}`;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/** The one button in the system. Pill-shaped, warm, with five intents. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
