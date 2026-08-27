"use client";

export default function Logo({ size = "md", className = "" }) {
  const sizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
  };

  return (
    <span
      aria-label="ClockHost"
      role="img"
      className={`font-bold tracking-tight ${sizes[size] || sizes.md} ${className}`}
    >
      Clock<span className="text-[var(--color-flame)]">Host</span>
    </span>
  );
}
