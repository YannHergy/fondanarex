import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Defaults from eslint-config-next
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or reported output — never hand-edited, so never linted.
    "lib/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
