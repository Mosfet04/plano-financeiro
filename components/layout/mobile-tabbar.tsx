"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/**
 * Barra inferior do celular: dois destinos de cada lado e o botão de novo
 * lançamento elevado no meio, como o botão de ação do Teams mobile.
 */
export function MobileTabBar({ onNewTransaction }: { onNewTransaction: () => void }) {
  const pathname = usePathname();
  const [left, right] = [NAV_ITEMS.slice(0, 2), NAV_ITEMS.slice(2)];

  const renderItem = (href: string, label: string, Icon: (typeof NAV_ITEMS)[number]["icon"]) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-full min-w-16 flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
          active ? "text-brand" : "text-fg-muted"
        )}
      >
        <Icon className="size-5" />
        <span className="text-[10px] leading-none font-semibold">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="border-stroke-subtle bg-surface pb-safe fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
    >
      <div className="flex h-14 items-stretch">
        {left.map((item) => renderItem(item.href, item.label, item.icon))}

        {/* O botão sobe acima da barra: é a ação que você faz dez vezes por dia. */}
        <div className="relative w-16 shrink-0">
          <button
            type="button"
            onClick={onNewTransaction}
            aria-label="Novo lançamento"
            className="bg-brand text-brand-foreground active:bg-brand-pressed absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full shadow-[var(--shadow-8)] transition-colors"
          >
            <Plus className="size-7" />
          </button>
        </div>

        {right.map((item) => renderItem(item.href, item.label, item.icon))}
      </div>
    </nav>
  );
}
