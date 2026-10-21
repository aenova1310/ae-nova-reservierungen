import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Schichtentrennung: Generierter Prisma-Code nur in src/server (und Seed/Tests)
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/lib/**/*.ts", "src/i18n/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/generated/*"], message: "Prisma nur über src/server/** verwenden." },
          ],
        },
      ],
    },
  },
  {
    // Gäste-Widget und UI-Bausteine laufen im Browser: keine Server-Module
    files: ["src/components/widget/**/*.tsx", "src/components/ui/**/*.tsx", "src/components/table-view/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/*"], message: "Client-Komponenten dürfen keine Server-Module importieren." }] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "public/embed.js"]),
]);

export default eslintConfig;
