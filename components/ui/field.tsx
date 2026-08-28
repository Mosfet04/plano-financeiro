import * as React from "react";

import { cn } from "@/lib/utils";

const controlClasses =
  "h-11 w-full rounded-control border border-stroke bg-surface px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-disabled focus:border-brand disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // Select nativo de propósito: no Android abre a roleta do sistema, que é
  // mais rápida de usar com uma mão do que qualquer dropdown customizado.
  return (
    <select className={cn(controlClasses, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-fg-muted text-xs font-semibold", className)} {...props} />;
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
      {hint ? <p className="text-fg-muted text-xs">{hint}</p> : null}
    </div>
  );
}
