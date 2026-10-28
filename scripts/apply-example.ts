// The one apply implementation: turn example names into file writes on an
// app tree, following the contract in APPLY-EXAMPLES.md exactly. Outer's
// Rust engine (slice O, crates/outer/src/examples/apply.rs) must produce
// byte-identical results on the same inputs, so the formatting rules below
// are exact and simple. The shared golden fixtures in
// scripts/apply-fixtures/ (mirrored verbatim at
// crates/outer/tests/fixtures/apply/) pin the writes and every refusal
// message byte for byte.
//
// - Nav icons merge into the braces on the `// outer:nav-icons` line,
//   deduplicated and sorted byte-wise. New items insert just above the
//   `// outer:nav-items` line with the same indentation:
//   `{ href: "/x", label: "X", icon: Icon },`. An href already in the file
//   is skipped (nav is app-only: a website apply with nav refuses).
// - Each binding key writes one line above the `// outer:bindings` marker
//   with the marker's indentation:
//   `r2_buckets: [{ binding: "PHOTOS", bucket_name: "photos" }],`
//   A binding object serialises as `{ k: "v", ... }` with its keys sorted
//   byte-wise; binding keys insert in byte-wise order per example. A key
//   already in the file skips when its normalised value is equal, refuses
//   when it differs.
// - Migrations renumber to the next free numbers after the tree's highest
//   existing `db/migrations/NNNN_*.sql`, keeping relative order.
// - `dependencies` is not supported: an example.json carrying it is
//   rejected, and add_example never touches package.json (merging it
//   needs order-preserving edits neither engine does; re-serialising
//   would reorder the user's file).
//
// Validate everything first, then write: a refusal leaves the tree
// untouched. `check-examples.ts` drives this for every example and the
// combined cases; `apply-example.test.ts` pins the behaviour.
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class ApplyError extends Error {}

export interface ExampleNavItem {
  href: string;
  label: string;
  icon: string;
}

export interface ExampleMeta {
  name: string;
  title: string;
  summary: string;
  template: "app" | "website";
  requires?: string[];
  nav?: ExampleNavItem[];
  bindings?: Record<string, Record<string, string>[]>;
}

export interface ApplyRequest {
  /** App tree to modify in place. */
  treeDir: string;
  /** Directory holding one sub-directory per example. */
  examplesDir: string;
  /** Requested example names; `requires` resolve depth-first before them. */
  names: string[];
  /** Template of the app tree; examples for the other template refuse. */
  template: "app" | "website";
}

export interface ApplyResult {
  /** Resolved examples that had files to copy, requires first. */
  added: string[];
  /** Resolved examples already fully present (every copied file identical). */
  skipped: string[];
  /** Tree-relative paths written, byte-wise order (copies plus nav/config edits). */
  files: string[];
  /** Nav hrefs inserted into `pages/_nav.ts`. */
  nav: string[];
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const ICON_RE = /^[A-Z][A-Za-z0-9]{1,40}$/;
const BINDING_KEYS: Record<string, true> = { d1_databases: true, r2_buckets: true };
const DOC_FILES: Record<string, true> = { "example.json": true, "README.md": true };
const NAV_FILE = "pages/_nav.ts";
const CONFIG_FILE = "void.config.ts";
const NAV_ICONS_MARKER = "// outer:nav-icons";
const NAV_ITEMS_MARKER = "// outer:nav-items";
const BINDINGS_MARKER = "// outer:bindings";
const MIGRATION_RE = /^db\/migrations\/\d+_(.+)\.sql$/;
const TREE_MIGRATION_RE = /^(\d+)_.*\.sql$/;
const MAX_DEPTH = 3;

function fail(message: string): never {
  throw new ApplyError(message);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadExampleMeta(examplesDir: string, name: string): Promise<ExampleMeta> {
  const dir = path.join(examplesDir, name);
  if (!(await pathExists(path.join(dir, "example.json")))) fail(`unknown example "${name}"`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(dir, "example.json"), "utf8"));
  } catch (error) {
    fail(`example "${name}": example.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Boundary check once; below reads named fields off the asserted shape.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    fail(`example "${name}": example.json must be a JSON object`);
  const json = raw as Record<string, unknown>;
  if (typeof json["name"] !== "string" || !NAME_RE.test(json["name"]))
    fail(`example "${name}": example.json "name" must match ${NAME_RE}`);
  if (json["name"] !== name) fail(`example "${name}": example.json "name" must equal the directory name`);
  if (json["template"] !== "app" && json["template"] !== "website")
    fail(`example "${name}": example.json "template" must be "app" or "website"`);
  if (typeof json["title"] !== "string" || json["title"].length === 0)
    fail(`example "${name}": example.json "title" must be a non-empty string`);
  if (typeof json["summary"] !== "string" || json["summary"].length === 0)
    fail(`example "${name}": example.json "summary" must be a non-empty string`);
  if (json["dependencies"] !== undefined)
    fail(`example "${name}": example.json "dependencies" is not supported (examples ship files only; add_example never touches package.json)`);
  const meta: ExampleMeta = {
    name,
    title: json["title"],
    summary: json["summary"],
    template: json["template"],
  };
  if (json["requires"] !== undefined) {
    const requiresJson = json["requires"];
    if (!Array.isArray(requiresJson) || !requiresJson.every((r) => typeof r === "string" && NAME_RE.test(r)))
      fail(`example "${name}": example.json "requires" must be an array of example names`);
    const requires = requiresJson as string[];
    if (new Set(requires).size !== requires.length) fail(`example "${name}": example.json "requires" lists a duplicate`);
    if (requires.includes(name)) fail(`example "${name}": example.json "requires" must not list itself`);
    meta.requires = [...requires];
  }
  if (json["nav"] !== undefined) {
    if (!Array.isArray(json["nav"])) fail(`example "${name}": example.json "nav" must be an array`);
    const seen = new Set<string>();
    meta.nav = (json["nav"] as unknown[]).map((item, i) => {
      const entry = item as Record<string, unknown>;
      if (typeof item !== "object" || item === null || typeof entry["href"] !== "string" || typeof entry["label"] !== "string" || typeof entry["icon"] !== "string")
        fail(`example "${name}": example.json "nav[${i}]" must be { href, label, icon } strings`);
      if (!entry["href"].startsWith("/")) fail(`example "${name}": example.json "nav[${i}].href" must start with "/"`);
      if (!ICON_RE.test(entry["icon"]))
        fail(`example "${name}": example.json "nav[${i}].icon" must match ${ICON_RE}`);
      if (seen.has(entry["href"])) fail(`example "${name}": example.json "nav" lists a duplicate href`);
      seen.add(entry["href"]);
      return { href: entry["href"], label: entry["label"], icon: entry["icon"] };
    });
  }
  if (json["bindings"] !== undefined) {
    const bindingsJson = json["bindings"];
    if (typeof bindingsJson !== "object" || bindingsJson === null || Array.isArray(bindingsJson))
      fail(`example "${name}": example.json "bindings" must be an object`);
    meta.bindings = {};
    for (const [key, value] of Object.entries(bindingsJson as Record<string, unknown>)) {
      if (!BINDING_KEYS[key]) fail(`example "${name}": example.json "bindings" only allows d1_databases and r2_buckets`);
      if (!Array.isArray(value) || value.length === 0) fail(`example "${name}": example.json "bindings.${key}" must be a non-empty array`);
      meta.bindings[key] = (value as unknown[]).map((binding, i) => {
        const record = binding as Record<string, unknown>;
        if (typeof binding !== "object" || binding === null || Object.keys(record).length === 0)
          fail(`example "${name}": example.json "bindings.${key}[${i}]" must be a non-empty object`);
        for (const [k, v] of Object.entries(record)) {
          if (typeof v !== "string") fail(`example "${name}": example.json "bindings.${key}[${i}].${k}" must be a string`);
        }
        return record as Record<string, string>;
      });
    }
  }
  return meta;
}

// Tree-relative copy source paths for an example, sorted. README.md and
// example.json are docs, never app files. Symlinks refuse: the tree must
// hold exactly what the example ships.
async function collectCopyFiles(examplesDir: string, name: string): Promise<{ rel: string; abs: string }[]> {
  const out: { rel: string; abs: string }[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const entryRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`example "${name}": ${entryRel} is a symlink (examples ship plain files only)`);
      if (entry.isDirectory()) {
        await walk(abs, entryRel);
      } else if (entry.isFile()) {
        if (!DOC_FILES[entryRel]) out.push({ rel: entryRel, abs });
      }
    }
  }
  await walk(path.join(examplesDir, name), "");
  return out;
}

const NAV_ICONS_REFUSAL = `refusing to apply nav: ${NAV_FILE} has no ${NAV_ICONS_MARKER} marker (the nav was restructured). Add the nav lines by hand — see the example README "Without add_example"`;
async function exampleNames(examplesDir: string): Promise<string[]> {
  try {
    return (await readdir(examplesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

// Resolve `names` depth-first: requires come first, each example once.
// Refuses cycles and chains deeper than 3.
export async function resolveExamples(examplesDir: string, names: string[]): Promise<ExampleMeta[]> {
  const metas = new Map<string, ExampleMeta>();
  const resolved: ExampleMeta[] = [];
  const done = new Set<string>();
  async function meta(name: string): Promise<ExampleMeta> {
    let m = metas.get(name);
    if (!m) {
      m = await loadExampleMeta(examplesDir, name);
      metas.set(name, m);
    }
    return m;
  }
  async function visit(name: string, chain: string[]): Promise<void> {
    if (done.has(name)) return;
    if (chain.includes(name)) fail(`requires cycle: ${[...chain, name].join(" -> ")}`);
    if (chain.length >= MAX_DEPTH) fail(`requires chain deeper than ${MAX_DEPTH}: ${[...chain, name].join(" -> ")}`);
    const m = await meta(name);
    for (const dep of m.requires ?? []) {
      if (!(await pathExists(path.join(examplesDir, dep, "example.json")))) fail(`example "${name}" requires unknown example "${dep}"`);
      await visit(dep, [...chain, name]);
    }
    done.add(name);
    resolved.push(m);
  }
  for (const name of names) {
    if (!(await pathExists(path.join(examplesDir, name, "example.json"))))
      fail(`unknown example "${name}"; pick one of: ${(await exampleNames(examplesDir)).join(", ")}`);
    await visit(name, []);
  }
  return resolved;
}

function migrationSuffix(rel: string): string | null {
  const match = MIGRATION_RE.exec(rel);
  return match ? match[1]! : null;
}

async function highestMigration(treeDir: string): Promise<number> {
  const dir = path.join(treeDir, "db/migrations");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let max = 0;
  for (const entry of entries) {
    const match = TREE_MIGRATION_RE.exec(entry);
    if (match) max = Math.max(max, parseInt(match[1]!, 10));
  }
  return max;
}

function bindingValue(bindings: Record<string, string>[]): string {
  const one = (binding: Record<string, string>) =>
    `{ ${Object.entries(binding)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}: "${v}"`)
      .join(", ")} }`;
  return `[${bindings.map(one).join(", ")}]`;
}

/// Every `href: "..."` value on a line, tolerating spacing variants.
function scanHrefs(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  for (;;) {
    const pos = rest.indexOf("href");
    if (pos === -1) break;
    rest = rest.slice(pos + 4);
    const colon = /^\s*:/.exec(rest);
    if (!colon) continue;
    const after = rest.slice(colon[0].length).trimStart();
    if (!after.startsWith('"')) continue;
    const end = after.indexOf('"', 1);
    if (end === -1) break;
    out.push(after.slice(1, end));
    rest = after.slice(end + 1);
  }
  return out;
}

/// `key` as an object key on `line`: word-boundary match followed by `:`.
function findKey(line: string, key: string): number | null {
  let from = 0;
  for (;;) {
    const pos = line.indexOf(key, from);
    if (pos === -1) return null;
    const before = pos === 0 ? "" : line[pos - 1]!;
    const beforeOk = pos === 0 || !/[A-Za-z0-9_$]/.test(before);
    if (beforeOk && line.slice(pos + key.length).trimStart().startsWith(":")) return pos;
    from = pos + 1;
  }
}

/// The value after `key:` in `lines`, from its `[` to the matching `]`,
/// if the key appears at all.
function findKeyValue(lines: string[], key: string): string | null {
  let start: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const pos = findKey(lines[i]!, key);
    if (pos !== null && lines[i]!.slice(pos).includes("[")) {
      start = i;
      break;
    }
  }
  if (start === null) return null;
  // Bracket-match from the first `[` on the key's line.
  let depth = 0;
  let begun = false;
  let value = "";
  for (let offset = 0; offset < lines.length - start; offset++) {
    const line = lines[start + offset]!;
    const from = offset === 0 ? line.indexOf("[") : 0;
    for (const c of line.slice(from < 0 ? 0 : from)) {
      if (c === "[") {
        depth += 1;
        begun = true;
      }
      if (begun) value += c;
      if (c === "]") {
        depth -= 1;
        if (begun && depth === 0) return value;
      }
    }
    if (begun) value += "\n";
  }
  return null;
}

export async function applyExamples(request: ApplyRequest): Promise<ApplyResult> {
  const { treeDir, examplesDir, names, template } = request;
  const resolved = await resolveExamples(examplesDir, names);
  for (const meta of resolved) {
    if (meta.template !== template)
      fail(`example "${meta.name}" is for the ${meta.template} template and cannot apply to a ${template} app`);
  }
  const navSource = resolved.find((m) => (m.nav ?? []).length > 0);
  if (navSource && template !== "app")
    fail(`example "${navSource.name}" declares nav but the "${template}" template has no nav file`);

  // Plan every write before touching the tree: a refusal writes nothing.
  interface PlannedFile {
    rel: string;
    abs: string;
    example: string;
  }
  const planned = new Map<string, PlannedFile>();
  const skipped: string[] = [];
  const added: string[] = [];
  for (const meta of resolved) {
    const copies = await collectCopyFiles(examplesDir, meta.name);
    let present = true;
    for (const { rel, abs } of copies) {
      if (migrationSuffix(rel) !== null) continue; // Migrations renumber, so they never count as applied.
      let treeContent: Buffer | null = null;
      try {
        treeContent = await readFile(path.join(treeDir, rel));
      } catch {
        present = false;
        continue;
      }
      const exampleContent = await readFile(abs);
      if (!treeContent.equals(exampleContent)) present = false;
    }
    if (present) {
      skipped.push(meta.name);
      continue;
    }
    added.push(meta.name);
    for (const { rel, abs } of copies) {
      if (migrationSuffix(rel) === null) {
        const clash = planned.get(rel);
        if (clash && !(await readFile(clash.abs)).equals(await readFile(abs)))
          fail(`refusing to apply "${meta.name}": ${rel} is also shipped by "${clash.example}" with different content`);
        if (!clash) planned.set(rel, { rel, abs, example: meta.name });
      }
    }
  }
  if (added.length === 0) {
    const all = resolved.map((m) => m.name);
    fail(`${all.join(", ")} ${all.length === 1 ? "is" : "are"} already applied: every file matches, nothing to do`);
  }
  const fresh = resolved.filter((m) => added.includes(m.name));

  // Renumber migrations past the tree's highest, in resolution order.
  let nextMigration = (await highestMigration(treeDir)) + 1;
  for (const meta of fresh) {
    const migrations = (await collectCopyFiles(examplesDir, meta.name))
      .filter(({ rel }) => migrationSuffix(rel) !== null)
      .sort((a, b) => (a.rel < b.rel ? -1 : 1));
    for (const { rel, abs } of migrations) {
      const renamed = `db/migrations/${String(nextMigration).padStart(4, "0")}_${migrationSuffix(rel)}.sql`;
      nextMigration += 1;
      const clash = planned.get(renamed);
      if (clash) fail(`refusing to apply "${meta.name}": ${renamed} collides (also shipped by "${clash.example}")`);
      planned.set(renamed, { rel: renamed, abs, example: meta.name });
    }
  }

  // A file already in the tree with different content refuses, naming it.
  for (const { rel, abs, example } of planned.values()) {
    let treeContent: Buffer | null = null;
    try {
      treeContent = await readFile(path.join(treeDir, rel));
    } catch {
      continue;
    }
    if (!treeContent.equals(await readFile(abs)))
      fail(`refusing to apply "${example}": ${rel} already exists with different content (delete or merge it by hand, then re-run)`);
  }

  // Nav edits: icons merge sorted into the marker line, items insert above
  // their marker. An href already in the file is skipped. Each example
  // reads the previous example's edits, so shared hrefs insert once.
  // Only fresh examples participate: skipped ones are already applied.
  const wantsNav = fresh.some((m) => (m.nav ?? []).length > 0);
  let navInitial: string | null = null;
  let navWorking: string | null = null;
  const insertedNav: string[] = [];
  if (wantsNav) {
    let initial: string;
    try {
      initial = await readFile(path.join(treeDir, NAV_FILE), "utf8");
    } catch {
      fail(`refusing to apply nav: ${NAV_FILE} is missing (add the nav lines by hand — see the example README "Without add_example")`);
    }
    const first = initial.split("\n");
    if (!first.some((line) => line.includes(NAV_ICONS_MARKER))) fail(NAV_ICONS_REFUSAL);
    if (!first.some((line) => line.includes(NAV_ITEMS_MARKER)))
      fail(`refusing to apply nav: ${NAV_FILE} has no ${NAV_ITEMS_MARKER} marker (the nav was restructured). Add the nav lines by hand — see the example README "Without add_example"`);
    navInitial = initial;
    navWorking = initial;
    for (const meta of fresh) {
      const have = new Set(navWorking.split("\n").flatMap(scanHrefs));
      const items = (meta.nav ?? []).filter((item) => !have.has(item.href));
      if (items.length === 0) continue;
      const lines = navWorking.split("\n");
      const wanted = [...new Set(items.map((item) => item.icon))];
      const at = lines.findIndex((line) => line.includes(NAV_ICONS_MARKER));
      const line = lines[at]!;
      const open = line.indexOf("{");
      const close = line.indexOf("}");
      if (open === -1 || close === -1 || open >= close) fail(NAV_ICONS_REFUSAL);
      const current = line
        .slice(open + 1, close)
        .split(",")
        .map((icon) => icon.trim())
        .filter(Boolean);
      const merged = [...new Set([...current, ...wanted])].sort();
      lines[at] = `${line.slice(0, open + 1)} ${merged.join(", ")} ${line.slice(close)}`;
      const marker = lines.findIndex((line) => line.includes(NAV_ITEMS_MARKER));
      const markerLine = lines[marker]!;
      const indent = markerLine.slice(0, markerLine.length - markerLine.trimStart().length);
      lines.splice(
        marker,
        0,
        ...items.map((item) => `${indent}{ href: "${item.href}", label: "${item.label}", icon: ${item.icon} },`),
      );
      insertedNav.push(...items.map((item) => item.href));
      navWorking = lines.join("\n");
    }
  }

  // Binding edits: one line per key above the marker, keys in byte-wise
  // order per example. An equal entry skips; a different one refuses.
  const wantsBindings = fresh.some((m) => Object.keys(m.bindings ?? {}).length > 0);
  let configInitial: string | null = null;
  let configWorking: string | null = null;
  if (wantsBindings) {
    let initial: string;
    try {
      initial = await readFile(path.join(treeDir, CONFIG_FILE), "utf8");
    } catch {
      fail(`refusing to apply bindings: ${CONFIG_FILE} is missing (add the bindings by hand — see the example README "Without add_example")`);
    }
    if (!initial.split("\n").some((line) => line.includes(BINDINGS_MARKER)))
      fail(`refusing to apply bindings: ${CONFIG_FILE} has no ${BINDINGS_MARKER} marker (the config was restructured). Add the bindings by hand — see the example README "Without add_example"`);
    configInitial = initial;
    configWorking = initial;
    for (const meta of fresh) {
      for (const key of Object.keys(meta.bindings ?? {}).sort()) {
        const value = meta.bindings![key]!;
        const expected = `${key}: ${bindingValue(value)},`;
        const lines = configWorking.split("\n");
        const have = findKeyValue(lines, key);
        if (have === null) {
          const at = lines.findIndex((line) => line.includes(BINDINGS_MARKER));
          const markerLine = lines[at]!;
          const indent = markerLine.slice(0, markerLine.length - markerLine.trimStart().length);
          lines.splice(at, 0, `${indent}${expected}`);
          configWorking = lines.join("\n");
        } else if (have.replace(/\s+/g, "") !== bindingValue(value).replace(/\s+/g, "")) {
          fail(
            `refusing to apply "${meta.name}": ${CONFIG_FILE} already declares ${key} with a different value (existing entry wins: ${have.trim()})`,
          );
        }
      }
    }
  }

  // All validation passed: write.
  const files: string[] = [];
  for (const { rel, abs } of planned.values()) {
    const dest = path.join(treeDir, rel);
    let treeContent: Buffer | null = null;
    try {
      treeContent = await readFile(dest);
    } catch {
      // Missing: write it below.
    }
    if (treeContent !== null && treeContent.equals(await readFile(abs))) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(abs, dest);
    files.push(rel);
  }

  if (navWorking !== null && navInitial !== null && navWorking !== navInitial) {
    await writeFile(path.join(treeDir, NAV_FILE), navWorking);
    files.push(NAV_FILE);
  }

  if (configWorking !== null && configWorking !== configInitial) {
    await writeFile(path.join(treeDir, CONFIG_FILE), configWorking);
    files.push(CONFIG_FILE);
  }

  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { added, skipped, files, nav: insertedNav };
}

// Minimal CLI for debugging and end-to-end runs:
//   bun scripts/apply-example.ts --tree <dir> --examples-dir <dir> --template app photos
if (import.meta.main) {
  const argv = process.argv.slice(2);
  let treeDir: string | undefined;
  let examplesDir = path.resolve(import.meta.dir, "..", "examples");
  let template: "app" | "website" | undefined;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--tree") treeDir = argv[++i];
    else if (arg === "--examples-dir") examplesDir = argv[++i]!;
    else if (arg === "--template") template = argv[++i] as "app" | "website";
    else if (arg.startsWith("-")) fail(`unknown flag ${arg}`);
    else names.push(arg);
  }
  if (!treeDir || !template || names.length === 0) fail(`usage: apply-example.ts --tree <dir> --template <app|website> [--examples-dir <dir>] <name...>`);
  try {
    const result = await applyExamples({ treeDir, examplesDir, names, template });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ApplyError) {
      console.error(`apply failed: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
