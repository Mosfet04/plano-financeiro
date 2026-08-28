"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

/**
 * Rail vertical do Teams: ícone com rótulo pequeno embaixo e a pílula de
 * seleção grudada na borda esquerda. Só aparece no desktop — no celular quem
 * manda é a `MobileTabBar`.
 */
export function AppRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="border-stroke-subtle bg-surface-subtle hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r py-2 md:flex"
    >
      {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-control relative flex w-14 flex-col items-center gap-1 py-2 transition-colors",
              active
                ? "bg-brand-tint text-[var(--brand-pressed)] dark:text-white"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg"
            )}
          >
            {active ? (
              <span className="bg-brand absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-r" />
            ) : null}
            <Icon className="size-5" />
            <span className="text-[10px] leading-tight font-semibold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
