/**
 * Atualiza o app no relógio: testa, gera o APK de release e instala por ADB.
 *
 *   npm run watch:install                       # relógio já conectado no adb
 *   npm run watch:install -- 192.168.0.42:41235 # conecta antes (porta da "Depuração por Wi-Fi")
 *
 * O pareamento (`adb pair`) só é preciso uma vez por PC; a porta de conexão
 * muda cada vez que a depuração por Wi-Fi é ligada, por isso ela vem no argumento.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const WATCH_DIR = path.resolve("watch");
const APK = path.join(WATCH_DIR, "app/build/outputs/apk/release/app-release.apk");

const sdk = process.env.ANDROID_HOME ?? path.join(homedir(), "Android/Sdk");
const adb = path.join(sdk, "platform-tools/adb");
// O Gradle precisa de um JDK; o que vem com o Android Studio basta.
const javaHome = process.env.JAVA_HOME ?? "/opt/android-studio/jbr";

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`falhou: ${path.basename(command)} ${args.join(" ")}`);
}

/** Relógios conectados — emuladores ficam de fora para não instalar no lugar errado. */
function connectedWatches() {
  const { stdout } = spawnSync(adb, ["devices"], { encoding: "utf8" });
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device" && !serial.startsWith("emulator-"))
    .map(([serial]) => serial);
}

if (!existsSync(adb)) fail(`adb não encontrado em ${adb}. Defina ANDROID_HOME.`);
if (!existsSync(path.join(javaHome, "bin/java")))
  fail(`JDK não encontrado em ${javaHome}. Defina JAVA_HOME.`);

const target = process.argv[2];
if (target) {
  console.log(`→ conectando em ${target}`);
  run(adb, ["connect", target]);
}

const watches = connectedWatches();
if (watches.length === 0) {
  fail(
    "nenhum relógio conectado. No relógio, ligue Opções do desenvolvedor → Depuração por Wi-Fi\n" +
      "  e rode de novo com o IP:porta que aparece lá: npm run watch:install -- IP:PORTA\n" +
      "  (primeira vez neste PC? antes: adb pair IP:PORTA_DO_PAREAMENTO)"
  );
}
if (watches.length > 1) {
  fail(`mais de um relógio conectado (${watches.join(", ")}). Passe o IP:porta do certo.`);
}
const [watch] = watches;

console.log("→ testando e gerando o APK de release");
run("./gradlew", [":app:testDebugUnitTest", ":app:assembleRelease"], {
  cwd: WATCH_DIR,
  env: { ...process.env, JAVA_HOME: javaHome },
});

console.log(`→ instalando em ${watch}`);
run(adb, ["-s", watch, "install", "-r", APK]);

console.log(
  "\n✓ Relógio atualizado. Lembre de desligar a Depuração por Wi-Fi quando terminar — ela gasta bateria."
);
