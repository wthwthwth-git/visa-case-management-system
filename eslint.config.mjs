import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".tools/**",
      "docs/**",
      "prisma/generated/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
