import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "bin", "xcstrings-doctor.js");
const fixture = join(here, "fixtures", "Localizable.xcstrings");

test("audits a realistic catalog through the CLI", () => {
  const result = spawnSync(process.execPath, [cli, fixture, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.files, 1);
  assert.equal(report.entries, 2);
  assert.equal(report.completion, 100);
  assert.equal(report.errors, 0);
});

test("fails when a required locale is absent from the entire catalog", () => {
  const result = spawnSync(process.execPath, [cli, fixture, "--locale", "de", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.errors, 2);
  assert(report.findings.every((finding) => finding.code === "missing-locale"));
});

test("rejects unknown and conflicting output options", () => {
  const unknown = spawnSync(process.execPath, [cli, fixture, "--fix"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown option '--fix'/);

  const conflicting = spawnSync(process.execPath, [cli, fixture, "--json", "--github"], { encoding: "utf8" });
  assert.equal(conflicting.status, 2);
  assert.match(conflicting.stderr, /either --json or --github/);
});
