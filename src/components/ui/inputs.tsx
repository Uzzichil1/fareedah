import {
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

// Shared field skin: warm surface, taupe hairline, blush focus ring. forwardRef
// on every control so react-hook-form's `register()` ref binds cleanly.
const fieldBase =
  "w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] text-ink shadow-[var(--shadow-card)] transition-colors placeholder:text-ink-soft/60 focus:border-rose-soft focus:outline-none focus:ring-2 focus:ring-blush disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${fieldBase} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${fieldBase} leading-relaxed ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`${fieldBase} cursor-pointer appearance-none pr-10 ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    );
  },
);

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft ${className}`}
      {...props}
    />
  );
}

/** Inline validation / server error text in the warm danger tone.
 *  `role="alert"` + `aria-live="polite"` so screen readers announce validation
 *  and server errors the moment they appear. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" aria-live="polite" className="mt-1.5 text-sm text-danger">
      {children}
    </p>
  );
}
