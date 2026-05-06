import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: {
    background: "src/background.ts",
    popup: "src/popup.ts",
    options: "src/options.ts",
    dashboard: "src/dashboard.ts",
    onboarding: "src/onboarding.ts",
  },
  bundle: true,
  outdir: ".",
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
});
