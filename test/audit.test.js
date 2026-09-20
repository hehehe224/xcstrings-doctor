import test from "node:test";
import assert from "node:assert/strict";
import { auditCatalog, formatGitHub } from "../src/audit.js";

const unit = (value, state = "translated") => ({ stringUnit: { state, value } });

test("detects an entirely missing locale for a key", () => {
  const result = auditCatalog({ sourceLanguage: "en", strings: { Hello: { localizations: { en: unit("Hello"), fr: unit("Bonjour") } }, Continue: { localizations: { en: unit("Continue") } } } });
  assert(result.findings.some((item) => item.code === "missing-locale" && item.locale === "fr"));
  assert.equal(result.expected, 2);
  assert.equal(result.translated, 1);
});

test("detects placeholder drift", () => {
  const result = auditCatalog({ sourceLanguage: "en", strings: { "Hello %1$@ — %.2f": { localizations: { en: unit("Hello %1$@ — %.2f"), fr: unit("Bonjour %1$@") } } } });
  assert(result.findings.some((item) => item.code === "placeholder"));
});

test("audits plural variation units", () => {
  const plural = (one, other) => ({ variations: { plural: { one: unit(one), other: unit(other) } } });
  const result = auditCatalog({ sourceLanguage: "en", strings: { "%d files": { localizations: { en: plural("%d file", "%d files"), fr: plural("%d fichier", "fichiers") } } } });
  assert(result.findings.some((item) => item.code === "placeholder" && item.variation.includes("other")));
});

test("audits substitution variation units", () => {
  const substitution = (one, other) => ({ substitutions: { count: { argNum: 1, formatSpecifier: "lld", variations: { plural: { one: unit(one), other: unit(other) } } } } });
  const result = auditCatalog({ sourceLanguage: "en", strings: { "%#@count@": { localizations: { en: substitution("%lld file", "%lld files"), fr: substitution("%lld fichier", "fichiers") } } } });
  assert(result.findings.some((item) => item.code === "placeholder" && item.variation.includes("substitutions.count")));
});

test("requires an explicitly configured locale even when absent everywhere", () => {
  const result = auditCatalog({ sourceLanguage: "en", strings: { Hello: { localizations: { en: unit("Hello") } } } }, "catalog.xcstrings", { locales: ["fr-CA"] });
  assert(result.findings.some((item) => item.code === "missing-locale" && item.locale === "fr-CA"));
});

test("ignores configured locales and non-translatable entries", () => {
  const result = auditCatalog({ sourceLanguage: "en", strings: { Hello: { localizations: { en: unit("Hello"), fr: unit("Bonjour"), de: unit("") } }, Brand: { shouldTranslate: false, localizations: { en: unit("Brand") } } } }, "catalog.xcstrings", { excludeLocales: ["de"] });
  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.locales, ["fr"]);
});

test("renders GitHub annotations", () => {
  const output = formatGitHub({ findings: [{ level: "error", code: "missing-locale", file: "App, Main.xcstrings", locale: "fr", key: "Hello", message: "Missing: 100%" }] });
  assert.match(output, /^::error file=App%2C Main\.xcstrings/);
  assert.match(output, /Missing: 100%25/);
});
