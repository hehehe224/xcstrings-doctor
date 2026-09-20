#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { auditPath, formatGitHub, formatHuman } from "../src/audit.js";

const help = `xcstrings-doctor [path] [options]

  --fail-under N       minimum translation completion (default: 100)
  --exclude LOCALE     exclude a locale; repeatable
  --locale LOCALE      require a locale; repeatable
  --ignore-stale       do not warn about stale entries
  --json               machine-readable report
  --github             GitHub Actions annotations
  -h, --help           show this help`;

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      "fail-under": { type: "string" },
      exclude: { type: "string", multiple: true },
      locale: { type: "string", multiple: true },
      "ignore-stale": { type: "boolean" },
      json: { type: "boolean" },
      github: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help) {
    console.log(help);
    process.exit(0);
  }
  if (positionals.length > 1) throw new Error("Expected at most one catalog path.");
  if (values.json && values.github) throw new Error("Choose either --json or --github, not both.");

  const threshold = Number(values["fail-under"] ?? 100);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error("--fail-under must be between 0 and 100.");

  const report = await auditPath(resolve(positionals[0] ?? "."), {
    excludeLocales: values.exclude ?? [],
    locales: values.locale ?? [],
    ignoreStale: values["ignore-stale"] ?? false
  });
  console.log(values.json ? JSON.stringify(report, null, 2) : values.github ? formatGitHub(report) : formatHuman(report));
  process.exitCode = report.errors > 0 || report.completion < threshold ? 1 : 0;
} catch (error) {
  console.error(`xcstrings-doctor: ${error.message}`);
  process.exitCode = 2;
}
