import Link from "next/link";

export default function Logo({ size = "md", showTagline = false, href = "/", variant = "light" }) {
  const sizes = {
    sm: { icon: 28, text: "text-lg", tagline: "text-[10px]" },
    md: { icon: 36, text: "text-xl", tagline: "text-xs" },
    lg: { icon: 48, text: "text-3xl", tagline: "text-sm" },
  };
  const s = sizes[size] || sizes.md;
  const isDark = variant === "dark";

  const content = (
    <div className="flex items-center gap-2.5">
      <div className="relative flex items-center justify-center rounded-xl" style={{ width: s.icon, height: s.icon }}>
        <svg width={s.icon} height={s.icon} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="HostMe" role="img">
          <rect width="48" height="48" rx="12" fill={isDark ? "var(--color-flame)" : "var(--color-primary)"} />
          <path d="M14 34V18L24 10L34 18V34H28V26H20V34H14Z" fill="white" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className={`${s.text} font-bold tracking-tight`} style={{ color: isDark ? "var(--color-night-text)" : "var(--color-ink)" }}>
          Host<span style={{ color: isDark ? "var(--color-gold)" : "var(--color-primary)" }}>Me</span>
        </span>
        {showTagline && <span className={`${s.tagline} leading-tight`} style={{ color: isDark ? "var(--color-night-muted)" : "var(--color-ink-muted)" }}>Find your space</span>}
      </div>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
