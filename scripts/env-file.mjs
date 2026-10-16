// Gestión del único archivo local de entorno (`.env`) sin leer su contenido.
//
//   node scripts/env-file.mjs check
//   node scripts/env-file.mjs install <ruta-al-.env-origen>
//
// Nunca abre, lee ni imprime valores: `check` solo mira nombres de archivos del
// directorio raíz y `install` usa una copia del sistema de archivos con
// COPYFILE_EXCL (no sobrescribe un destino existente).
import { chmodSync, constants, copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, ".env");

// Archivos que Next carga además de `.env` y que tendrían precedencia sobre él
// (https://nextjs.org/docs/app/guides/environment-variables#environment-variable-load-order).
// `.env.example` y `.env.example.local` no los carga Next y quedan fuera.
const SHADOWING_FILES = [
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.test.local",
  ".env.development",
  ".env.production",
  ".env.test",
];

function shadowingFiles() {
  return SHADOWING_FILES.filter((name) => existsSync(path.join(root, name)));
}

function fail(message) {
  console.error(`[env] ${message}`);
  process.exit(1);
}

function check() {
  const found = shadowingFiles();
  if (found.length > 0) {
    fail(
      `Se encontraron ${found.join(", ")}. Next los carga con precedencia sobre .env, así que ` +
        "el entorno efectivo dejaría de ser el de .env. GALCOA+ usa un único archivo local: .env. " +
        "Muévelo o elimínalo tú (no se leyó ni se tocó) y vuelve a ejecutar.",
    );
  }
}

function install(sourceArg) {
  if (!sourceArg) fail("Uso: npm run env:install -- <ruta-al-archivo-.env>");
  check();
  const source = path.resolve(sourceArg);
  if (source === target) fail("El origen ya es .env en la raíz del repositorio.");
  if (!existsSync(source) || !statSync(source).isFile()) fail(`El origen no existe o no es un archivo: ${source}`);
  if (existsSync(target)) fail(".env ya existe en la raíz; no se sobrescribe sin autorización explícita (bórralo tú si corresponde).");
  copyFileSync(source, target, constants.COPYFILE_EXCL);
  try {
    chmodSync(target, 0o600);
  } catch {
    // En Windows el modo POSIX no aplica.
  }
  console.log(`[env] .env creado desde ${source} (contenido no leído). No lo agregues a git.`);
}

const [command, arg] = process.argv.slice(2);
if (command === "check") check();
else if (command === "install") install(arg);
else fail("Comando desconocido. Usa `check` o `install <ruta>`.");
