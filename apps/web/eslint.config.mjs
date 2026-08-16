import next from "eslint-config-next";

/** Flat config: Next's recommended rules plus a hard ban on `any`. */
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...next,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
];

export default config;
