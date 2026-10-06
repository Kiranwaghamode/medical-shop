"use client";

import { cn } from "cn";

/** Small toggle group: one option selected at a time (e.g. Strip / Tablet, % / ₹, Cash / UPI / Card). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "default" | "sm";
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
            value === option.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
