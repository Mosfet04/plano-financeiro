import {
  deviceExpiry,
  DeviceKind,
  isDeviceActive,
  isPairingExpired,
  normalizeUserCode,
  PAIRING_POLL_INTERVAL_SECONDS,
  PAIRING_TTL_SECONDS,
  PairingStatus,
  type Device,
} from "@/core/domain/device/device.entity";
import { DomainError, err, ok, type Result } from "@/core/domain/shared/result";

import type {
  Clock,
  DevicePairingRepository,
  DeviceRepository,
  IdGenerator,
  SecretGenerator,
} from "../ports";

export interface StartedPairing {
  /** Segredo do relógio. Só ele conhece; o banco guarda o hash. */
  readonly deviceCode: string;
  readonly userCode: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export interface IssuedToken {
  readonly token: string;
  readonly deviceId: string;
}

/** Prefixo para reconhecer o token num log ou num vazamento. */
const TOKEN_PREFIX = "pfw_";
const AGENT_TOKEN_PREFIX = "pfa_";
const AGENT_NAME = "Rotina do Claude";
/** A renovação do prazo só grava uma vez por hora — não a cada chamada do relógio. */
const TOUCH_INTERVAL_MS = 3_600_000;

/**
 * Pareamento no modelo do login de TV (RFC 8628): o relógio pede um código,
 * você aprova no PWA logado, o relógio troca o segredo dele pelo token. O
 * plano vem de quem aprovou — o relógio nunca diz de qual plano é.
 */
export class DevicePairingUseCase {
  constructor(
    private readonly pairings: DevicePairingRepository,
    private readonly devices: DeviceRepository,
    private readonly secrets: SecretGenerator,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async start(deviceName: string): Promise<StartedPairing> {
    const now = this.clock.now();
    await this.pairings.deleteExpired(now);

    const deviceCode = this.secrets.token();
    const userCode = this.secrets.userCode();
    await this.pairings.save({
      id: this.ids.generate(),
      deviceCodeHash: this.secrets.hash(deviceCode),
      userCode,
      deviceName,
      status: PairingStatus.PENDING,
      planId: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000),
      lastPolledAt: null,
    });

    return {
      deviceCode,
      userCode,
      expiresIn: PAIRING_TTL_SECONDS,
      interval: PAIRING_POLL_INTERVAL_SECONDS,
    };
  }

  /** Você confirmou o código no PWA: o pedido fica preso ao seu plano. */
  async approve(userCodeInput: string, planId: string): Promise<Result<{ deviceName: string }>> {
    const pairing = await this.pairings.findByUserCode(normalizeUserCode(userCodeInput));
    if (
      !pairing ||
      pairing.status !== PairingStatus.PENDING ||
      isPairingExpired(pairing, this.clock.now())
    ) {
      return err(
        new DomainError("PAIRING_NOT_FOUND", "Código inválido ou vencido. Gere outro no relógio.")
      );
    }

    await this.pairings.save({ ...pairing, status: PairingStatus.APPROVED, planId });
    return ok({ deviceName: pairing.deviceName });
  }

  /** O relógio pergunta, a cada `interval` segundos, se já foi aprovado. */
  async exchange(deviceCode: string): Promise<Result<IssuedToken>> {
    const now = this.clock.now();
    const pairing = await this.pairings.findByDeviceCodeHash(this.secrets.hash(deviceCode));
    if (!pairing || isPairingExpired(pairing, now)) {
      if (pairing) await this.pairings.delete(pairing.id);
      return err(new DomainError("PAIRING_EXPIRED", "O código venceu. Gere outro."));
    }

    const sincePoll = pairing.lastPolledAt ? now.getTime() - pairing.lastPolledAt.getTime() : null;
    if (sincePoll !== null && sincePoll < PAIRING_POLL_INTERVAL_SECONDS * 1000) {
      return err(new DomainError("PAIRING_SLOW_DOWN", "Pergunte com menos frequência."));
    }

    if (pairing.status === PairingStatus.PENDING || !pairing.planId) {
      await this.pairings.save({ ...pairing, lastPolledAt: now });
      return err(new DomainError("PAIRING_PENDING", "Aguardando a confirmação no celular."));
    }

    const token = `${TOKEN_PREFIX}${this.secrets.token()}`;
    const device: Device = {
      id: this.ids.generate(),
      planId: pairing.planId,
      kind: DeviceKind.WATCH,
      name: pairing.deviceName,
      tokenHash: this.secrets.hash(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: deviceExpiry(now),
      revokedAt: null,
    };
    await this.devices.save(device);
    await this.pairings.delete(pairing.id);

    return ok({ token, deviceId: device.id });
  }

  /**
   * Token da rotina mensal, gerado por quem está logado — não há relógio para
   * mostrar código, então o pareamento é você copiar o token para o ambiente
   * da rotina. Só um vale por vez: gerar outro revoga o anterior, que é o que
   * você quer quando acha que o antigo vazou.
   */
  async issueAgentToken(planId: string): Promise<IssuedToken> {
    const now = this.clock.now();

    const current = await this.devices.listByPlan(planId);
    for (const device of current) {
      if (device.kind === DeviceKind.AGENT && device.revokedAt === null) {
        await this.devices.save({ ...device, revokedAt: now });
      }
    }

    const token = `${AGENT_TOKEN_PREFIX}${this.secrets.token()}`;
    const device: Device = {
      id: this.ids.generate(),
      planId,
      kind: DeviceKind.AGENT,
      name: AGENT_NAME,
      tokenHash: this.secrets.hash(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: deviceExpiry(now),
      revokedAt: null,
    };
    await this.devices.save(device);

    return { token, deviceId: device.id };
  }

  /**
   * Resolve o dispositivo pelo token e renova o prazo de 90 dias. O tipo tem de
   * bater: o token da rotina não abre as rotas do relógio, nem o contrário.
   */
  async authenticate(token: string, kind: DeviceKind): Promise<Result<Device>> {
    const now = this.clock.now();
    const device = await this.devices.findByTokenHash(this.secrets.hash(token));
    if (!device || device.kind !== kind || !isDeviceActive(device, now)) {
      return err(new DomainError("DEVICE_UNAUTHORIZED", "Relógio não pareado. Pareie de novo."));
    }

    if (now.getTime() - device.lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return ok(device);

    const touched = { ...device, lastUsedAt: now, expiresAt: deviceExpiry(now) };
    await this.devices.save(touched);
    return ok(touched);
  }
}
