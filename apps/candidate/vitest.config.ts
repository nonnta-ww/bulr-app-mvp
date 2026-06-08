import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/self-analysis/_lib/**/*.test.ts"],
  },
});
