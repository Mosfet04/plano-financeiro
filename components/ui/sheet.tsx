"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Folha que sobe de baixo no celular e vira diálogo centrado no desktop —
 * o mesmo comportamento do Teams mobile ao abrir uma ação.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "bg-surface text-fg fixed z-50 flex flex-col outline-none",
            // Celular: folha colada embaixo, ocupando a largura toda.
            "pb-safe inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl",
            "transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            // Desktop: diálogo centrado.
            "sm:rounded-card sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[28rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:shadow-[var(--shadow-8)]",
            "sm:data-[ending-style]:translate-y-[-50%] sm:data-[ending-style]:scale-95 sm:data-[ending-style]:opacity-0",
            "sm:data-[starting-style]:translate-y-[-50%] sm:data-[starting-style]:scale-95 sm:data-[starting-style]:opacity-0"
          )}
        >
          {/* Alça de arrasto: só decoração, mas é o que faz parecer nativo. */}
          <div className="bg-stroke mx-auto mt-2 h-1 w-9 rounded-full sm:hidden" />

          <div className="flex items-start justify-between gap-4 px-4 pt-3 pb-2">
            <div className="flex flex-col gap-0.5">
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-fg-muted text-xs">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="rounded-control text-fg-muted hover:bg-surface-hover -mt-1 -mr-1 grid size-9 place-items-center"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>

          {footer ? (
            <div className="border-stroke-subtle flex gap-2 border-t px-4 py-3">{footer}</div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
