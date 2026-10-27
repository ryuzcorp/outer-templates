// The one apply implementation: turn example names into file writes on an
// app tree, following the contract in APPLY-EXAMPLES.md exactly. Outer's
// Rust engine (slice O) must produce byte-identical results on the same
// inputs, so the formatting rules below are exact and simple:
//
// - Nav icons merge into the braces on the `// outer:nav-icons` line,
//   deduplicated and sorted byte-wise (`Array.sort`, ASCII = byte order).
//   New items insert just above the `// outer:nav-items` line with the same
//   indentation: `{ href: "/x", label: "X", icon: Icon },`. An href already
//   in the file is skipped.
// - Each binding key writes one line above the `// outer:bindings` marker
//   with the marker's indentation:
//   `r2_buckets: [{ binding: "PHOTOS", bucket_name: "photos" }],`
//   A binding object serialises as `{ k: "v", ... }` with its keys in
//   `example.json` order. A key already in the file skips when its trimmed
//   line is equal, refuses when it differs.
// - Migrations renumber to the next free numbers after the tree's highest
//   existing `db/migrations/NNNN_*.sql`, keeping relative order.
// - `package.json` merges `dependencies` (existing order kept, new keys
//   appended in `example.json` order) and writes `JSON.stringify(pkg, null,
//   2) + "\n"`.
//
// Validate everything first, then write: a refusal leaves the tree
// untouched. `check-examples.ts` drives this for every example and the
// combined cases; `apply-example.test.ts` pins the behaviour.
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
  dependencies?: Record<string, string>;
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
  /** Tree-relative paths written, resolution order then path order. */
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
const MIGRATION_RE = /^db\/migrations\/\d+_(.+)$/;
const TREE_MIGRATION_RE = /^(\d+)_.*\.sql$/;
const MAX_DEPTH = 3;

function fail(message: string): never {
  throw new ApplyError(message);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadExampleMeta(examplesDir: string, name: string): Promise<ExampleMeta> {
  const dir = path.join(examplesDir, name);
  if (!(await pathExists(dir))) fail(`unknown example "${name}" (no directory in ${examplesDir})`);
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
  if (json["dependencies"] !== undefined) {
    const depsJson = json["dependencies"];
    if (typeof depsJson !== "object" || depsJson === null || Array.isArray(depsJson))
      fail(`example "${name}": example.json "dependencies" must be an object`);
    for (const [pkg, range] of Object.entries(depsJson as Record<string, unknown>)) {
      if (typeof range !== "string" || range.length === 0)
        fail(`example "${name}": example.json dependency "${pkg}" must be a version-range string`);
    }
    meta.dependencies = { ...(depsJson as Record<string, string>) };
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
      if (!(await pathExists(path.join(examplesDir, dep)))) fail(`example "${name}" requires unknown example "${dep}"`);
      await visit(dep, [...chain, name]);
    }
    done.add(name);
    resolved.push(m);
  }
  for (const name of names) {
    if (!(await pathExists(path.join(examplesDir, name)))) fail(`unknown example "${name}" (no directory in ${examplesDir})`);
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
  return `[${bindings.map((b) => `{ ${Object.entries(b).map(([k, v]) => `${k}: "${v}"`).join(", ")} }`).join(", ")}]`;
}

function indentOf(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

export async function applyExamples(request: ApplyRequest): Promise<ApplyResult> {
  const { treeDir, examplesDir, names, template } = request;
  const resolved = await resolveExamples(examplesDir, names);
  for (const meta of resolved) {
    if (meta.template !== template)
      fail(`example "${meta.name}" is for the ${meta.template} template and cannot apply to a ${template} app`);
  }

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
    let present = copies.length > 0;
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

  // Renumber migrations past the tree's highest, in resolution order.
  let nextMigration = (await highestMigration(treeDir)) + 1;
  const plannedMigrations: { rel: string; abs: string; example: string }[] = [];
  for (const meta of resolved) {
    if (skipped.includes(meta.name)) continue;
    const migrations = (await collectCopyFiles(examplesDir, meta.name))
      .filter(({ rel }) => migrationSuffix(rel) !== null)
      .sort((a, b) => (a.rel < b.rel ? -1 : 1));
    for (const { rel, abs } of migrations) {
      const renamed = `db/migrations/${String(nextMigration).padStart(4, "0")}_${migrationSuffix(rel)}`;
      nextMigration += 1;
      const clash = planned.get(renamed);
      if (clash) fail(`refusing to apply "${meta.name}": ${renamed} collides (also shipped by "${clash.example}")`);
      planned.set(renamed, { rel: renamed, abs, example: meta.name });
      plannedMigrations.push({ rel: renamed, abs, example: meta.name });
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
  // their marker. An href already in the file is skipped.
  interface NavEdit {
    icons: string[];
    items: ExampleNavItem[];
  }
  const navEdits: { meta: string; edit: NavEdit }[] = [];
  const wantsNav = resolved.some((m) => (m.nav ?? []).length > 0);
  let navText: string | null = null;
  if (wantsNav) {
    try {
      navText = await readFile(path.join(treeDir, NAV_FILE), "utf8");
    } catch {
      fail(`refusing to apply nav: ${NAV_FILE} is missing (add the nav lines by hand — see the example README "Without add_example")`);
    }
    const lines = navText.split("\n");
    if (!lines.some((line) => line.includes(NAV_ICONS_MARKER)))
      fail(`refusing to apply nav: ${NAV_FILE} has no ${NAV_ICONS_MARKER} marker (the nav was restructured). Add the nav lines by hand — see the example README "Without add_example"`);
    if (!lines.some((line) => line.includes(NAV_ITEMS_MARKER)))
      fail(`refusing to apply nav: ${NAV_FILE} has no ${NAV_ITEMS_MARKER} marker (the nav was restructured). Add the nav lines by hand — see the example README "Without add_example"`);
    for (const meta of resolved) {
      const items = (meta.nav ?? []).filter((item) => !navText!.includes(`href: "${item.href}"`));
      const icons = [...new Set(items.map((item) => item.icon))];
      if (items.length > 0) navEdits.push({ meta: meta.name, edit: { icons, items } });
    }
  }

  // Binding edits: one line per key above the marker. An equal entry
  // skips; a different one refuses.
  interface BindingEdit {
    key: string;
    line: string;
  }
  const bindingEdits: { meta: string; edit: BindingEdit }[] = [];
  const wantsBindings = resolved.some((m) => Object.keys(m.bindings ?? {}).length > 0);
  let configText: string | null = null;
  if (wantsBindings) {
    try {
      configText = await readFile(path.join(treeDir, CONFIG_FILE), "utf8");
    } catch {
      fail(`refusing to apply bindings: ${CONFIG_FILE} is missing (add the bindings by hand — see the example README "Without add_example")`);
    }
    if (!configText.split("\n").some((line) => line.includes(BINDINGS_MARKER)))
      fail(`refusing to apply bindings: ${CONFIG_FILE} has no ${BINDINGS_MARKER} marker (the config was restructured). Add the bindings by hand — see the example README "Without add_example"`);
    for (const meta of resolved) {
      for (const [key, value] of Object.entries(meta.bindings ?? {})) {
        const expected = `${key}: ${bindingValue(value)},`;
        const existing = configText
          .split("\n")
          .find((line) => new RegExp(`^\\s*${key}\\s*:`).test(line));
        if (existing !== undefined) {
          if (existing.trim() !== expected)
            fail(
              `refusing to apply "${meta.name}": ${CONFIG_FILE} already declares ${key} with a different value (existing entry wins: ${existing.trim()})`,
            );
        } else {
          bindingEdits.push({ meta: meta.name, edit: { key, line: expected } });
        }
      }
    }
  }

  // Dependency edits: an existing different version refuses.
  const dependencyEdits: { meta: string; pkg: string; range: string }[] = [];
  const wantsDependencies = resolved.some((m) => Object.keys(m.dependencies ?? {}).length > 0);
  let packageJson: { dependencies?: Record<string, string>; [key: string]: unknown } | null = null;
  if (wantsDependencies) {
    let pkgText: string;
    try {
      pkgText = await readFile(path.join(treeDir, "package.json"), "utf8");
    } catch {
      fail(`refusing to apply dependencies: package.json is missing in the app tree`);
    }
    try {
      packageJson = JSON.parse(pkgText);
    } catch {
      fail(`refusing to apply dependencies: package.json is not valid JSON`);
    }
    for (const meta of resolved) {
      for (const [pkg, range] of Object.entries(meta.dependencies ?? {})) {
        const existing = packageJson!.dependencies?.[pkg];
        if (existing !== undefined && existing !== range)
          fail(
            `refusing to apply "${meta.name}": package.json already depends on ${pkg}@${existing} (wants ${range}); resolve the version by hand`,
          );
        if (existing === undefined) dependencyEdits.push({ meta: meta.name, pkg, range });
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

  const insertedNav: string[] = [];
  if (navText !== null && (navEdits.length > 0 || wantsNav)) {
    const lines = navText.split("\n");
    const wantedIcons = new Set<string>();
    for (const { edit } of navEdits) for (const icon of edit.icons) wantedIcons.add(icon);
    if (wantedIcons.size > 0) {
      const index = lines.findIndex((line) => line.includes(NAV_ICONS_MARKER));
      const line = lines[index]!;
      const open = line.indexOf("{");
      const close = line.indexOf("}");
      const current = line
        .slice(open + 1, close)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const merged = [...new Set([...current, ...wantedIcons])].sort();
      lines[index] = `${line.slice(0, open + 1)} ${merged.join(", ")} ${line.slice(close)}`;
    }
    const freshItems: ExampleNavItem[] = [];
    for (const { edit } of navEdits) freshItems.push(...edit.items);
    if (freshItems.length > 0) {
      const index = lines.findIndex((line) => line.includes(NAV_ITEMS_MARKER));
      const indent = indentOf(lines[index]!);
      const insert = freshItems.map((item) => `${indent}{ href: "${item.href}", label: "${item.label}", icon: ${item.icon} },`);
      lines.splice(index, 0, ...insert);
      insertedNav.push(...freshItems.map((item) => item.href));
    }
    if (wantedIcons.size > 0 || freshItems.length > 0) {
      await writeFile(path.join(treeDir, NAV_FILE), lines.join("\n"));
    }
  }

  if (configText !== null && bindingEdits.length > 0) {
    const lines = configText.split("\n");
    const index = lines.findIndex((line) => line.includes(BINDINGS_MARKER));
    const indent = indentOf(lines[index]!);
    lines.splice(index, 0, ...bindingEdits.map(({ edit }) => `${indent}${edit.line}`));
    await writeFile(path.join(treeDir, CONFIG_FILE), lines.join("\n"));
  }

  if (packageJson !== null && dependencyEdits.length > 0) {
    packageJson.dependencies ??= {};
    for (const { pkg, range } of dependencyEdits) packageJson.dependencies[pkg] = range;
    await writeFile(path.join(treeDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  }

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
