import { createHash, randomBytes, randomInt } from "crypto";

import type { SecretGenerator } from "@/core/application/ports";
import { USER_CODE_ALPHABET, USER_CODE_LENGTH } from "@/core/domain/device/device.entity";

/**
 * SHA-256 basta para o hash: o token tem 256 bits aleatórios, então não há
 * dicionário a atacar — bcrypt e afins existem para senha escolhida por gente.
 */
export const nodeSecretGenerator: SecretGenerator = {
  token: () => randomBytes(32).toString("base64url"),
  userCode: () =>
    Array.from(
      { length: USER_CODE_LENGTH },
      () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]
    ).join(""),
  hash: (value) => createHash("sha256").update(value).digest("hex"),
};
