// Fuente única de las barreras de arquitectura (docs/architecture.md, «Dependencias
// permitidas y barreras»). La consumen eslint.config.mjs y los tests de
// tests/boundaries/. Rutas relativas a la raíz del repositorio, con globs.

/** Paquetes de servidor/proveedores que nunca deben alcanzar presentación, contratos ni preview. */
export const SERVER_PACKAGES = [
  "pg",
  "pg/*",
  "@supabase/*",
  "@hiero-ledger/*",
  "@hashgraph/*",
  "@react-pdf/*",
  "@ai-sdk/*",
  "ai",
  "groq-sdk",
  "stripe",
  "mercadopago",
  "server-only",
];

/** Módulos de Node (incluye el prefijo `node:`); no existen en presentación ni contratos. */
export const NODE_BUILTINS = [
  "node:*",
  "fs",
  "fs/*",
  "path",
  "os",
  "child_process",
  "crypto",
  "net",
  "http",
  "https",
  "stream",
  "worker_threads",
];

export const NEXT_PACKAGES = ["next", "next/*"];
export const REACT_PACKAGES = ["react", "react/*", "react-dom", "react-dom/*"];

/** Globales de red y entorno vedados fuera del servidor. */
export const NETWORK_AND_ENV_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "process",
];

/** Carpetas del servidor; cada archivo bajo ellas debe importar `server-only`. */
export const SERVER_DIRS = [
  "src/lib/supabase",
  "src/lib/ai",
  "src/lib/documents",
  "src/lib/hedera",
  "src/lib/conversion",
];

/** Archivos de prueba: pueden usar fixtures y mocks. */
export const TEST_FILES = ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"];

/**
 * Utilidades puras que la presentación puede importar (lista pequeña, no todo
 * `lib/`). Rutas bajo `src/`.
 */
export const PRESENTATION_ALLOWLIST = [
  "lib/contracts/**",
  "features/*/contracts/**",
  "components/ui/**",
  "lib/utils.{ts,tsx}", // llaves: `except` exige globs
  "features/*/components/**",
];

const dirGlobs = (...dirs) => dirs.map((d) => `${d}/**`);

/** Ruta del repo → glob absoluto con «/» (minimatch lo exige; `except` no se resuelve solo). */
const absoluteFrom = (basePath) => (p) => `${basePath.split("\\").join("/")}/${p}`;

/**
 * Zonas de `import/no-restricted-paths`. Se evalúan sobre la ruta *resuelta*
 * (TypeScript: alias `@/*`, relativas y reexports), no sobre el texto del import.
 */
export function createZones(basePath) {
  // `except` de import/no-restricted-paths no se resuelve contra basePath: debe ser absoluto.
  const abs = absoluteFrom(basePath);
  return [
    {
      target: "src/features/*/components/**",
      from: "src/**",
      except: PRESENTATION_ALLOWLIST.map((p) => abs(`src/${p}`)),
      message:
        "La presentación solo puede importar contracts, feature/contracts, components/ui, lib/utils y otras presentaciones.",
    },
    {
      target: "src/features/*/components/**",
      from: ["preview/**", "tests/**", "supabase/**"],
      message: "La presentación no depende del preview ni de tests.",
    },
    {
      target: "src/lib/contracts/**",
      from: "src/**",
      except: [abs("src/lib/contracts/**")],
      message: "Los contratos solo dependen de otros contratos (y Zod).",
    },
    {
      target: ["src/app/**", "src/lib/**", "src/components/**", "src/hooks/**", "src/features/*/containers/**", "src/features/*/components/**"],
      from: ["src/mocks/**", "src/features/*/fixtures/**", "preview/**", "tests/**"],
      message: "El código de producto no importa mocks, fixtures, preview ni tests.",
    },
    {
      target: "src/mocks/**",
      from: "src/**",
      except: [abs("src/lib/contracts/**"), abs("src/mocks/**")],
      message: "Los escenarios compartidos solo dependen de contratos.",
    },
    {
      target: "preview/**",
      from: [...dirGlobs("src/app", "src/features/*/containers", "src/lib/supabase", "src/lib/ai", "src/lib/documents", "src/lib/hedera", "src/lib/rules")],
      message: "El preview no importa app, containers ni servicios.",
    },
  ];
}

/** `no-restricted-imports` por paquete para cada superficie. */
export const presentationPackages = [...NEXT_PACKAGES, ...SERVER_PACKAGES, ...NODE_BUILTINS];
export const contractPackages = [...NEXT_PACKAGES, ...REACT_PACKAGES, ...SERVER_PACKAGES, ...NODE_BUILTINS];
export const previewPackages = [...NEXT_PACKAGES, ...SERVER_PACKAGES, ...NODE_BUILTINS];

const restrictedImports = (names, message) => ({
  paths: [],
  patterns: [{ group: names, message }],
});

const restrictedGlobals = (message) =>
  NETWORK_AND_ENV_GLOBALS.map((name) => ({ name, message }));

/**
 * Bloques de configuración plana; el plugin `import` lo registra eslint-config-next.
 *
 * @param {{ basePath: string, resolverSettings?: Record<string, unknown> }} options
 * @returns {import("eslint").Linter.Config[]}
 */
export function createBoundaryConfigs({ basePath, resolverSettings }) {
  const abs = absoluteFrom(basePath);
  return [
    {
      name: "boundaries/paths",
      files: ["src/**/*.{ts,tsx}", "preview/**/*.{ts,tsx}"],
      ignores: TEST_FILES,
      settings: resolverSettings ? { "import/resolver": resolverSettings } : {},
      rules: {
        "import/no-restricted-paths": [
          "error",
          { basePath, zones: createZones(basePath) },
        ],
      },
    },
    {
      // Los tests de presentación pueden usar fixtures y mocks, pero no servidor.
      name: "boundaries/presentation-tests",
      files: ["src/features/*/components/**/*.test.{ts,tsx}"],
      settings: resolverSettings ? { "import/resolver": resolverSettings } : {},
      rules: {
        "import/no-restricted-paths": [
          "error",
          {
            basePath,
            zones: [
              {
                target: "src/features/*/components/**",
                from: "src/**",
                except: [
                  ...PRESENTATION_ALLOWLIST.map((p) => abs(`src/${p}`)),
                  abs("src/mocks/**"),
                  abs("src/features/*/fixtures/**"),
                ],
                message: "Los tests de presentación no importan servidor ni app.",
              },
            ],
          },
        ],
      },
    },
    {
      name: "boundaries/presentation",
      files: ["src/features/*/components/**/*.{ts,tsx}"],
      ignores: TEST_FILES,
      rules: {
        "no-restricted-imports": [
          "error",
          restrictedImports(presentationPackages, "La presentación no importa Next, SDK, servidor ni Node."),
        ],
        "no-restricted-globals": ["error", ...restrictedGlobals("La presentación no hace red ni lee entorno.")],
        "no-restricted-properties": [
          "error",
          { object: "window", property: "fetch", message: "Sin red en presentación." },
          { object: "globalThis", property: "fetch", message: "Sin red en presentación." },
        ],
        "no-restricted-syntax": [
          "error",
          { selector: "MetaProperty[meta.name='import'][property.name='meta']", message: "Sin import.meta.env en presentación." },
          { selector: "ImportExpression", message: "Sin imports dinámicos que eludan las barreras." },
          { selector: "CallExpression[callee.name='require']", message: "Sin require en presentación." },
        ],
      },
    },
    {
      name: "boundaries/contracts",
      files: ["src/lib/contracts/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          restrictedImports(contractPackages, "Los contratos no importan React, Next, SDK, servidor ni Node."),
        ],
        "no-restricted-globals": ["error", ...restrictedGlobals("Los contratos no usan red ni entorno.")],
        "no-restricted-syntax": [
          "error",
          { selector: "MetaProperty[meta.name='import'][property.name='meta']", message: "Sin import.meta.env en contratos." },
          { selector: "ImportExpression", message: "Sin imports dinámicos en contratos." },
        ],
      },
    },
    {
      name: "boundaries/preview",
      files: ["preview/**/*.{ts,tsx}"],
      ignores: ["preview/vite.config.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          restrictedImports(previewPackages, "El preview no importa Next, SDK, servidor ni Node."),
        ],
      },
    },
  ];
}
