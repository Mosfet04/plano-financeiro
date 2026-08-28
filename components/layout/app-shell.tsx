"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import {
  NewTransactionSheet,
  type SheetCategory,
  type SheetGoal,
} from "@/components/transacao/new-transaction-sheet";
import { Button } from "@/components/ui/button";
import { AppRail } from "./app-rail";
import { MobileTabBar } from "./mobile-tabbar";
import { TopBar } from "./top-bar";

/**
 * Casca do app. O estado da folha de novo lançamento mora aqui porque ela é
 * chamada de dois lugares: o botão central no celular e o botão da barra
 * superior no desktop.
 */
export function AppShell({
  userName,
  categories,
  goals,
  today,
  signOutAction,
  children,
}: {
  userName: string;
  categories: readonly SheetCategory[];
  goals: readonly SheetGoal[];
  today: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={userName} onSignOut={() => void signOutAction()} />

        <main className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-24 md:px-6 md:pb-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      {/* No desktop o botão flutuante fica no canto; no celular ele é o centro
          da barra inferior. */}
      <Button
        variant="primary"
        onClick={() => setSheetOpen(true)}
        className="fixed right-6 bottom-6 z-30 hidden h-12 gap-2 rounded-full px-5 shadow-[var(--shadow-8)] md:inline-flex"
      >
        <Plus className="size-5" />
        Novo lançamento
      </Button>

      <MobileTabBar onNewTransaction={() => setSheetOpen(true)} />

      <NewTransactionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={categories}
        goals={goals}
        today={today}
      />
    </div>
  );
}
