import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Plano financeiro",
  description: "Acompanhamento do plano do apartamento, das metas e do mês.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Plano" },
};

export const viewport: Viewport = {
  // `viewport-fit=cover` + as utilidades `pb-safe` fazem a barra inferior
  // conviver com o gesto de voltar do Android.
  viewportFit: "cover",
  // Sem isto o teclado do Android (Chrome 108+, Samsung Internet) só encolhe a
  // viewport visual, e a folha de baixo — com o botão Salvar — fica atrás dele.
  interactiveWidget: "resizes-content",
  // Declara que o app tem tema claro e escuro: o modo escuro do Samsung
  // Internet deixa de "escurecer à força" as cores, que já são nossas.
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1f1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
