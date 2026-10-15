"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut, MoreVertical, Moon, Palette, Settings2, Sun, Watch } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { titleForPath } from "./nav-items";

const menuItemClass =
  "flex cursor-default items-center gap-2 rounded-control px-3 py-2 text-sm text-fg outline-none select-none data-[highlighted]:bg-surface-hover";

/**
 * Barra superior no padrão Teams: título da seção à esquerda, ações à direita.
 * Premissas e aparência ficam aqui — são coisas que você mexe uma vez por mês,
 * não merecem um slot na navegação principal.
 */
export function TopBar({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <header className="border-stroke-subtle bg-surface sticky top-0 z-20 flex h-12 items-center gap-2 border-b px-3 md:px-4">
      <h1 className="flex-1 truncate text-base font-semibold">{titleForPath(pathname)}</h1>

      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Usar tema claro" : "Usar tema escuro"}
        className="rounded-control text-fg-muted hover:bg-surface-hover active:bg-surface-hover grid size-11 place-items-center md:size-9"
      >
        {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>

      <Menu.Root>
        <Menu.Trigger
          aria-label="Mais opções"
          className="rounded-control text-fg-muted hover:bg-surface-hover active:bg-surface-hover grid size-11 place-items-center md:size-9"
        >
          <MoreVertical className="size-5" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-40">
            <Menu.Popup className="rounded-card border-stroke-subtle bg-surface min-w-52 border p-1 shadow-[var(--shadow-8)]">
              <div className="text-fg-muted px-3 py-2 text-xs">{userName}</div>
              <Menu.Separator className="bg-stroke-subtle my-1 h-px" />
              <Menu.Item className={menuItemClass} render={<Link href="/premissas" />}>
                <Settings2 className="size-4" />
                Premissas
              </Menu.Item>
              <Menu.Item className={menuItemClass} render={<Link href="/aparencia" />}>
                <Palette className="size-4" />
                Aparência
              </Menu.Item>
              <Menu.Item className={menuItemClass} render={<Link href="/dispositivos" />}>
                <Watch className="size-4" />
                Dispositivos
              </Menu.Item>
              <Menu.Separator className="bg-stroke-subtle my-1 h-px" />
              <Menu.Item className={menuItemClass} onClick={onSignOut}>
                <LogOut className="size-4" />
                Sair
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </header>
  );
}
