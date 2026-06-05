import { type ReactNode } from "react";

type Tone = "neutral" | "sage" | "rose" | "danger" | "ink";

const tones: Record<Tone, string> = {
  neutral: "bg-blush/40 text-ink-soft",
  sage: "bg-sage-soft text-sage",
  rose: "bg-blush text-rose",
  danger: "bg-danger-soft text-danger",
  ink: "bg-ink text-paper",
};

/** Small letterspaced pill used for statuses, conditions, and labels. */
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
