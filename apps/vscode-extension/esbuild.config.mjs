import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

/**
 * Problem matcher plugin — emits markers that the
 * `$esbuild-watch` problem matcher (connor4312.esbuild-problem-matchers)
 * uses to know when the build starts/finishes.
 * @type {esbuild.Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["src/host/extension.ts"],
  bundle: true,
  outfile: "dist/host/extension.cjs",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !isProduction,
  minify: isProduction,
  plugins: isWatch ? [esbuildProblemMatcherPlugin] : [],
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
} else {
  await esbuild.build(config);
  console.log("[esbuild] build complete");
}
