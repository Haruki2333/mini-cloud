import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "target/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  nextPlugin.configs["core-web-vitals"],
  ...tseslint.configs.recommended,
];
