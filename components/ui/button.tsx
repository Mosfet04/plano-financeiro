import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Botão no padrão Fluent 2: cantos de 4px, sem gradiente, estado de hover
 * discreto. Altura mínima de 44px nas variantes de toque, e 40px no `sm`, para
 * o polegar acertar no celular.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-foreground hover:bg-brand-hover active:bg-brand-pressed",
        secondary:
          "border border-stroke bg-surface text-fg hover:bg-surface-hover active:bg-surface-hover",
        subtle: "text-fg hover:bg-surface-hover active:bg-surface-hover",
        danger: "bg-danger text-white hover:opacity-90 active:opacity-80",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        // Compacto só onde há mouse: no celular, 32px é pouco para o polegar.
        sm: "h-10 px-3 text-sm md:h-8 md:text-xs [&_svg]:size-4",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        touch: "h-11 px-4 text-sm [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
