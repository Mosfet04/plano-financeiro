"use client";

import { Watch } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { approvePairing, revokeDevice } from "@/app/actions/device.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

interface DeviceRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function DispositivosClient({
  initialCode,
  devices,
}: {
  initialCode: string;
  devices: readonly DeviceRow[];
}) {
  const router = useRouter();
  const [code, setCode] = React.useState(initialCode);
  const [pending, startTransition] = React.useTransition();

  function handlePair(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await approvePairing({ userCode: code });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.deviceName} pareado. Ele entra sozinho em alguns segundos.`);
      setCode("");
      router.replace("/dispositivos");
    });
  }

  function handleRevoke(device: DeviceRow) {
    startTransition(async () => {
      const result = await revokeDevice({ id: device.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${device.name} perdeu o acesso.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Parear relógio</CardTitle>
          <p className="text-fg-muted text-xs">
            Abra o app no relógio e digite o código que aparece nele.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex items-end gap-2" onSubmit={handlePair}>
            <Field label="Código" className="flex-1">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="K7QM-4TXP"
                autoCapitalize="characters"
                autoComplete="off"
                className="tabular tracking-widest uppercase"
              />
            </Field>
            <Button type="submit" variant="primary" size="touch" disabled={pending || !code.trim()}>
              Confirmar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relógios com acesso</CardTitle>
          <p className="text-fg-muted text-xs">
            O acesso expira depois de 90 dias sem uso. Revogue o que você não usa mais.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 px-2">
          {devices.length === 0 ? (
            <p className="text-fg-muted px-2 py-6 text-center text-sm">Nenhum relógio pareado.</p>
          ) : (
            devices.map((device) => (
              <div key={device.id} className="flex items-center gap-3 px-2 py-2">
                <Watch className="text-fg-muted size-5 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{device.name}</span>
                  <span className="text-fg-muted text-xs">
                    Pareado em {date(device.createdAt)} · usado em {date(device.lastUsedAt)} ·
                    expira em {date(device.expiresAt)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleRevoke(device)}
                >
                  Revogar
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
