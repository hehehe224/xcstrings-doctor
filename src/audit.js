import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const PLACEHOLDER = /%#@[^@]+@|%(?!%)(?:\d+\$)?[-+#0 ']*(?:\*|\d+)?(?:\.(?:\*|\d+))?(?:hh|h|ll|l|q|z|t|j)?[@diuoxXfFeEgGaAcCsSpnDUO]/g;
const ignoredFolders = new Set([".git", "node_modules", "Pods", ".build", "DerivedData", "build"]);
const placeholders = (value = "") => [...value.matchAll(PLACEHOLDER)].map((match) => match[0]).sort();
const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

async function filesAt(target) {
  const info = await stat(target);
  if (info.isFile()) return extname(target) === ".xcstrings" ? [target] : [];
  const files = [];
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (ignoredFolders.has(entry.name)) continue;
    const path = join(target, entry.name);
    if (entry.isDirectory()) files.push(...await filesAt(path));
    else if (entry.name.endsWith(".xcstrings")) files.push(path);
  }
  return files;
}

function units(node, path = "value", found = new Map()) {
  if (!node || typeof node !== "object") return found;
  if (node.stringUnit && typeof node.stringUnit === "object") found.set(path, node.stringUnit);
  for (const [key, value] of Object.entries(node)) {
    if (key === "stringUnit") continue;
    if (value && typeof value === "object") units(value, `${path}.${key}`, found);
  }
  return found;
}

function matchingSource(sourceUnits, targetPath) {
  if (sourceUnits.has(targetPath)) return sourceUnits.get(targetPath);
  const pluralFallback = targetPath.replace(/(\.plural\.)[^.]+$/, "$1other");
  return sourceUnits.get(pluralFallback) ?? sourceUnits.get("value") ?? [...sourceUnits.values()][0];
}

function sourceFor(entry, sourceLanguage, key) {
  const sourceUnits = units(entry.localizations?.[sourceLanguage]);
  if (!sourceUnits.size) sourceUnits.set("value", { state: "translated", value: key });
  return sourceUnits;
}

export function auditCatalog(catalog, file = "catalog.xcstrings", options = {}) {
  const sourceLanguage = catalog.sourceLanguage ?? "en";
  const findings = [];
  const strings = catalog.strings ?? {};
  const discoveredLocales = Object.values(strings).flatMap((entry) => Object.keys(entry.localizations ?? {}));
  const locales = [...new Set([...discoveredLocales, ...(options.locales ?? [])])].filter((locale) => locale !== sourceLanguage && !options.excludeLocales?.includes(locale)).sort();
  let translated = 0;
  let expected = 0;
  for (const [key, entry] of Object.entries(strings)) {
    if (!key.trim()) findings.push({ level: "warning", code: "empty-key", file, key, message: "Catalog contains an empty key." });
    if (entry.extractionState === "stale" && !options.ignoreStale) findings.push({ level: "warning", code: "stale", file, key, message: "Entry is marked stale by Xcode." });
    if (entry.shouldTranslate === false) {
      const unexpected = Object.keys(entry.localizations ?? {}).filter((locale) => locale !== sourceLanguage);
      if (unexpected.length) findings.push({ level: "warning", code: "unexpected-translation", file, key, message: `Entry is non-translatable but includes: ${unexpected.join(", ")}.` });
      continue;
    }
    const sourceUnits = sourceFor(entry, sourceLanguage, key);
    for (const locale of locales) {
      expected += 1;
      const localization = entry.localizations?.[locale];
      if (!localization) {
        findings.push({ level: "error", code: "missing-locale", file, key, locale, message: "Locale is missing for this key." });
        continue;
      }
      const targetUnits = units(localization);
      if (!targetUnits.size || [...targetUnits.values()].some((unit) => !unit.value || unit.state !== "translated")) {
        findings.push({ level: "error", code: "unfinished", file, key, locale, message: "Translation is empty or not marked translated." });
        continue;
      }
      translated += 1;
      for (const [unitPath, target] of targetUnits) {
        const source = matchingSource(sourceUnits, unitPath);
        const expectedPlaceholders = placeholders(source?.value ?? key);
        const actualPlaceholders = placeholders(target.value);
        if (!same(expectedPlaceholders, actualPlaceholders)) findings.push({ level: "error", code: "placeholder", file, key, locale, variation: unitPath, message: `Placeholder mismatch. Expected ${expectedPlaceholders.join(", ") || "none"}; found ${actualPlaceholders.join(", ") || "none"}.` });
      }
    }
  }
  return { sourceLanguage, locales, entries: Object.keys(strings).length, expected, translated, findings };
}

export async function auditPath(target, options = {}) {
  const files = await filesAt(target);
  const catalogs = [];
  const findings = [];
  for (const file of files) {
    const displayFile = relative(process.cwd(), file);
    try {
      const result = auditCatalog(JSON.parse(await readFile(file, "utf8")), displayFile, options);
      catalogs.push({ file: displayFile, sourceLanguage: result.sourceLanguage, locales: result.locales, entries: result.entries, expected: result.expected, translated: result.translated });
      findings.push(...result.findings);
    } catch (error) {
      findings.push({ level: "error", code: "invalid-json", file: displayFile, message: error.message });
    }
  }
  if (!files.length) findings.push({ level: "error", code: "no-catalogs", message: "No .xcstrings files found." });
  const expected = catalogs.reduce((sum, item) => sum + item.expected, 0);
  const translated = catalogs.reduce((sum, item) => sum + item.translated, 0);
  return { files: files.length, entries: catalogs.reduce((sum, item) => sum + item.entries, 0), completion: expected ? Math.round((translated / expected) * 10000) / 100 : 100, errors: findings.filter((item) => item.level === "error").length, warnings: findings.filter((item) => item.level === "warning").length, catalogs, findings };
}

export function formatHuman(report) {
  const lines = ["XCSTRINGS DOCTOR / localization audit", "", `${report.files} catalogs, ${report.entries} strings, ${report.completion}% complete`, ""];
  if (!report.findings.length) lines.push("PASS  Catalogs are healthy.");
  for (const item of report.findings) lines.push(`${item.level === "error" ? "FAIL" : "WARN"}  ${item.code}  ${[item.file, item.locale, item.key, item.variation].filter(Boolean).join(" / ")}\n      ${item.message}`);
  lines.push("", `${report.errors} errors, ${report.warnings} warnings`);
  return lines.join("\n");
}

export function formatGitHub(report) {
  const escapeData = (value) => String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  const escapeProperty = (value) => escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
  return report.findings.map((item) => {
    const file = item.file ? ` file=${escapeProperty(item.file)}` : "";
    const detail = item.locale ? ` (${item.locale}: ${item.key})` : "";
    return `::${item.level === "error" ? "error" : "warning"}${file},title=${escapeProperty(`xcstrings-doctor ${item.code}`)}::${escapeData(`${item.message}${detail}`)}`;
  }).join("\n");
}
