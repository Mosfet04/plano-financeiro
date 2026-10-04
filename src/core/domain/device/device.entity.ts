/**
 * Um relógio pareado com o plano. O token de acesso nunca é guardado — só o
 * hash dele; quem perde o token pareia de novo.
 */
export interface Device {
  readonly id: string;
  readonly planId: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  /** Renova a cada uso: o token expira depois de `DEVICE_IDLE_DAYS` parado. */
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export const PairingStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
} as const;
export type PairingStatus = (typeof PairingStatus)[keyof typeof PairingStatus];

/**
 * Pedido de pareamento em andamento, no modelo do login de TV (OAuth Device
 * Flow, RFC 8628): o relógio mostra `userCode`, você confirma no PWA logado, e
 * o relógio troca o `deviceCode` secreto pelo token.
 */
export interface DevicePairing {
  readonly id: string;
  readonly deviceCodeHash: string;
  readonly userCode: string;
  readonly deviceName: string;
  readonly status: PairingStatus;
  /** Preenchido na aprovação — é o que prende o relógio ao plano de quem aprovou. */
  readonly planId: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastPolledAt: Date | null;
}

export const DEVICE_IDLE_DAYS = 90;
export const PAIRING_TTL_SECONDS = 600;
export const PAIRING_POLL_INTERVAL_SECONDS = 5;

/** Sem 0/O, 1/I/L: o código é lido numa tela pequena e digitado no celular. */
export const USER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const USER_CODE_LENGTH = 8;

const DAY_MS = 86_400_000;

/** "k7qm-4txp" → "K7QM4TXP". Aceita o código como a pessoa digitar. */
export function normalizeUserCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** "K7QM4TXP" → "K7QM-4TXP", para exibir. */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function isDeviceActive(device: Device, now: Date): boolean {
  return device.revokedAt === null && device.expiresAt > now;
}

export function deviceExpiry(lastUsedAt: Date): Date {
  return new Date(lastUsedAt.getTime() + DEVICE_IDLE_DAYS * DAY_MS);
}

export function isPairingExpired(pairing: DevicePairing, now: Date): boolean {
  return pairing.expiresAt <= now;
}
