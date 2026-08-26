import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ href, label = "Back" }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]">
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
