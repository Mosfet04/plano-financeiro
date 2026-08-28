import { Receipt, Settings2, Target, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Os quatro destinos da barra. O quinto slot é o botão de novo lançamento. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/resumo", label: "Resumo", icon: Wallet },
  { href: "/mes", label: "Mês", icon: Receipt },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/projecao", label: "Projeção", icon: TrendingUp },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/premissas",
  label: "Premissas",
  icon: Settings2,
};

export function titleForPath(pathname: string): string {
  if (pathname.startsWith("/aparencia")) return "Aparência";
  const match = [...NAV_ITEMS, SETTINGS_ITEM].find((item) => pathname.startsWith(item.href));
  return match?.label ?? "Plano financeiro";
}
