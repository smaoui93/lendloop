import Link from "next/link";

export function Logo({ href = "/", large = false }: { href?: string; large?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-ink no-underline hover:text-ink">
      <span
        aria-hidden
        className={`grid place-items-center rounded-full border-2 border-brand text-brand ${
          large ? "h-8 w-8 text-[15px]" : "h-7 w-7 text-[13px]"
        }`}
      >
        ↻
      </span>
      <span className={large ? "text-xl" : "text-lg"}>LendLoop</span>
    </Link>
  );
}
