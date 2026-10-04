import { eq, lte } from "drizzle-orm";

import type { DevicePairingRepository, DeviceRepository } from "@/core/application/ports";
import type { Device, DevicePairing } from "@/core/domain/device/device.entity";

import type { Database } from "../client";
import { devicePairings, devices } from "../schema";
import { toDevice, toDevicePairing } from "./mappers";

export class DrizzleDeviceRepository implements DeviceRepository {
  constructor(private readonly db: Database) {}

  async findByTokenHash(tokenHash: string): Promise<Device | null> {
    const row = await this.db.query.devices.findFirst({ where: eq(devices.tokenHash, tokenHash) });
    return row ? toDevice(row) : null;
  }

  async findById(id: string): Promise<Device | null> {
    const row = await this.db.query.devices.findFirst({ where: eq(devices.id, id) });
    return row ? toDevice(row) : null;
  }

  async listByPlan(planId: string): Promise<Device[]> {
    const rows = await this.db.query.devices.findMany({
      where: eq(devices.planId, planId),
      orderBy: devices.createdAt,
    });
    return rows.map(toDevice);
  }

  async save(device: Device): Promise<void> {
    await this.db
      .insert(devices)
      .values(device)
      .onConflictDoUpdate({ target: devices.id, set: device });
  }
}

export class DrizzleDevicePairingRepository implements DevicePairingRepository {
  constructor(private readonly db: Database) {}

  async findByUserCode(userCode: string): Promise<DevicePairing | null> {
    const row = await this.db.query.devicePairings.findFirst({
      where: eq(devicePairings.userCode, userCode),
    });
    return row ? toDevicePairing(row) : null;
  }

  async findByDeviceCodeHash(deviceCodeHash: string): Promise<DevicePairing | null> {
    const row = await this.db.query.devicePairings.findFirst({
      where: eq(devicePairings.deviceCodeHash, deviceCodeHash),
    });
    return row ? toDevicePairing(row) : null;
  }

  async save(pairing: DevicePairing): Promise<void> {
    await this.db
      .insert(devicePairings)
      .values(pairing)
      .onConflictDoUpdate({ target: devicePairings.id, set: pairing });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(devicePairings).where(eq(devicePairings.id, id));
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.db.delete(devicePairings).where(lte(devicePairings.expiresAt, now));
  }
}
