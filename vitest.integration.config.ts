import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
