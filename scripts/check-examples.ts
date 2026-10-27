#!/usr/bin/env bun
// Checks every example under examples/ against the contract:
//
//   examples/<name>/example.json + README.md + files at app-relative paths
//
// For each example it validates metadata and file limits, then proves the
// files work: copy templates/<template> to a temp dir, overlay the example
// files, merge `dependencies` into package.json, and run `bun install`,
// `bun run check`, and `bun run build` there.
//
// Usage:
//   bun scripts/check-examples.ts [--examples-dir <dir>] [--example <name>...] [--keep]
//   bun run check-examples
//
// The examples directory defaults to <repo>/examples and can be overridden
// with the first positional arg, --examples-dir, or EXAMPLES_DIR (in that
// order). --example limits the run to named examples (repeatable). --keep
// leaves the temp dirs behind and prints their paths for debugging.
import { mkdtemp, mkdir, readdir, readFile, writeFile, copyFile, lstat, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES = 30;
const LOG_TAIL_LINES = 50;
// Template build output / installs are never part of the overlay source.
const COPY_SKIP: Record<string, true> = { node_modules: true, dist: true };

interface ExampleMeta {
  name: string;
  title: string;
  summary: string;
  template: "app" | "website";
  dependencies?: Record<string, string>;
}

interface OverlayFile {
  rel: string;
  abs: string;
  size: number;
}

function usage(): string {
  return `check-examples: validate + build every example in examples/

usage:
  bun scripts/check-examples.ts [options] [examples-dir]

options:
  --examples-dir <dir>  directory holding <name>/ example folders
                        (default: <repo>/examples; env EXAMPLES_DIR)
  --example <name>      only check this example (repeatable)
  --keep                keep temp dirs, print their paths
  -h, --help            this text

no symlinks, README.md present, every file <= 64KB, <= 30 files. then a fresh
copy of templates/<template> + the example files must pass bun install, check, build.
after the single examples, one combined case overlays passkeys + photos +
list-form on the same app (migrations renumbered 0001/0002/0003 as the
READMEs instruct, nav lines merged) and must pass install, check, build too.`;
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(2);
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function tail(log: string, n: number = LOG_TAIL_LINES): string {
  const lines = log.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}

async function run(cmd: string[], cwd: string): Promise<{ exit: number; log: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout as unknown as BodyInit).text(),
    new Response(proc.stderr as unknown as BodyInit).text(),
    proc.exited,
  ]);
  const log = err ? `${out}\n${err}` : out;
  return { exit: code, log: log.trimEnd() };
}

// Recursively list regular files under dir, rejecting symlinks anywhere.
async function collectFiles(dir: string, root: string = dir, out: OverlayFile[] = []): Promise<OverlayFile[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink not allowed: ${path.relative(root, abs)}`);
    if (entry.isDirectory()) await collectFiles(abs, root, out);
    else if (entry.isFile()) out.push({ rel: path.relative(root, abs), abs, size: (await stat(abs)).size });
    else throw new Error(`not a regular file or directory: ${path.relative(root, abs)}`);
  }
  return out;
}

// Copy a template tree minus build output and installs.
async function copyTemplate(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (COPY_SKIP[entry.name]) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) continue;
    else if (entry.isDirectory()) await copyTemplate(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

function validateMeta(raw: unknown, dirName: string): { meta?: ExampleMeta; error?: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "example.json must be a JSON object" };
  const m = raw as Record<string, unknown>;
  if (typeof m["name"] !== "string" || !NAME_RE.test(m["name"]))
    return { error: `example.json "name" must match ${NAME_RE}` };
  if (m["name"] !== dirName) return { error: `example.json "name" (${m["name"]}) must equal directory name (${dirName})` };
  if (m["template"] !== "app" && m["template"] !== "website")
    return { error: `example.json "template" must be "app" or "website"` };
  if (typeof m["title"] !== "string" || m["title"].length === 0) return { error: `example.json "title" must be a non-empty string` };
  if (typeof m["summary"] !== "string" || m["summary"].length === 0)
    return { error: `example.json "summary" must be a non-empty string` };
  if (m["dependencies"] !== undefined) {
    const d = m["dependencies"];
    if (typeof d !== "object" || d === null || Array.isArray(d)) return { error: `example.json "dependencies" must be an object` };
    for (const [pkg, range] of Object.entries(d as Record<string, unknown>)) {
      if (typeof range !== "string" || range.length === 0)
        return { error: `example.json dependency "${pkg}" must be a version-range string` };
    }
  }
  return {
    meta: {
      name: m["name"] as string,
      title: m["title"] as string,
      summary: m["summary"] as string,
      template: m["template"] as ExampleMeta["template"],
      ...(m["dependencies"] !== undefined ? { dependencies: m["dependencies"] as Record<string, string> } : {}),
    },
  };
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

// One combined overlay: several app examples applied to the same app, the
// way an agent merges them. Members apply in order; their migrations take
// the next free number (0001, 0002, …) exactly as the READMEs instruct, and
// their nav lines merge into pages/_nav.ts with the icons the READMEs name.
const COMBINED: { name: string; template: "app"; members: string[] } = {
  name: "combined",
  template: "app",
  members: ["passkeys", "photos", "list-form"],
};

const COMBINED_NAV_IMPORT = `import { Camera, House, KeyRound, ListChecks, Settings, Users } from "lucide";`;
const COMBINED_NAV_ANCHOR = `  { href: "/settings", label: "Settings", icon: Settings },`;
const COMBINED_NAV_LINES = [
  `  { href: "/sign-in", label: "Sign in", icon: KeyRound },`,
  `  { href: "/members", label: "Members", icon: Users },`,
  `  { href: "/photos", label: "Photos", icon: Camera },`,
  `  { href: "/tasks", label: "Tasks", icon: ListChecks },`,
].join("\n");
const COMBINED_NAV_IMPORT_ANCHOR = `import { House, Settings } from "lucide";`;
// The photos README's binding step, applied to the combined app.
const COMBINED_R2_ANCHOR = `    d1_databases: [{ binding: "DB", database_name: "app-db", migrations_dir: "db/migrations" }],`;
const COMBINED_R2_LINE = `    r2_buckets: [{ binding: "PHOTOS", bucket_name: "photos" }],`;
// The newsletter README's binding step, applied to the single-newsletter
// check: the website shell declares no Worker bindings, so the example
// only builds with the D1 binding added.
const NEWSLETTER_D1_ANCHOR = `    assets: { not_found_handling: "404-page" },`;
const NEWSLETTER_D1_LINE = `    d1_databases: [{ binding: "DB", database_name: "site-db", migrations_dir: "db/migrations" }],`;
// The photos README's gate step (step 6), applied to the combined app:
// the gate ships async and awaited, so gating only adds the import and
// replaces the body — the same edit the README asks the agent for.
const COMBINED_GATE_IMPORT_ANCHOR = `import { ValidationError } from "void/handler";`;
const COMBINED_GATE_IMPORT_LINE = `import { ensureAuthTables, getViewer } from "./_session.ts";`;
const COMBINED_GATE_ANCHOR = `async function canUpload(c: CloudContext): Promise<boolean> {\n  return true;\n}`;
const COMBINED_GATE_BODY = `async function canUpload(c: CloudContext): Promise<boolean> {\n  const db = await ensureAuthTables(env.DB);\n  return (await getViewer(db, c.req.header("cookie") ?? null)) !== null;\n}`;

function replaceOnce(haystack: string, needle: string, replacement: string, what: string): string {
  if (!haystack.includes(needle)) throw new Error(`combined overlay: ${what} anchor not found`);
  return haystack.replace(needle, replacement);
}

async function checkCombined(examplesDir: string, keep: boolean): Promise<CheckResult> {
  const name = COMBINED.name;
  // Load every member's overlay files (README/example.json are docs, not app files).
  const overlays: { member: string; files: OverlayFile[]; meta: ExampleMeta }[] = [];
  const seen = new Map<string, string>();
  for (const member of COMBINED.members) {
    let files: OverlayFile[];
    try {
      files = (await collectFiles(path.join(examplesDir, member)))
        .filter((f) => f.rel !== "example.json" && f.rel !== "README.md")
        .sort((a, b) => (a.rel < b.rel ? -1 : 1));
    } catch (e) {
      return { name, ok: false, detail: `${member}: ${e instanceof Error ? e.message : String(e)}` };
    }
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES)
        return { name, ok: false, detail: `${member}/${f.rel} is ${f.size} bytes (limit ${MAX_FILE_BYTES})` };
      const clash = seen.get(f.rel);
      if (clash !== undefined)
        return { name, ok: false, detail: `path collision: ${f.rel} shipped by both ${clash} and ${member}` };
      seen.set(f.rel, member);
    }
    let meta: ExampleMeta;
    try {
      const { meta: m, error } = validateMeta(
        JSON.parse(await readFile(path.join(examplesDir, member, "example.json"), "utf8")),
        member,
      );
      if (error) return { name, ok: false, detail: `${member}: ${error}` };
      meta = m!;
    } catch (e) {
      return { name, ok: false, detail: `${member}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (meta.template !== COMBINED.template)
      return { name, ok: false, detail: `${member}: template is ${meta.template}, combined case needs ${COMBINED.template}` };
    overlays.push({ member, files, meta });
  }

  const templateDir = path.join(ROOT, "templates", COMBINED.template);
  const workdir = await mkdtemp(path.join(tmpdir(), `check-example-${name}-`));
  try {
    await copyTemplate(templateDir, workdir);
    // Overlay in member order; migrations take the next free number.
    let migration = 1;
    const dependencies: Record<string, string> = {};
    for (const { files, meta } of overlays) {
      Object.assign(dependencies, meta.dependencies ?? {});
      for (const f of files) {
        let rel = f.rel;
        const mig = rel.match(/^db\/migrations\/\d+_(.+)$/);
        if (mig) rel = `db/migrations/${String(migration++).padStart(4, "0")}_${mig[1]}`;
        const dest = path.join(workdir, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(f.abs, dest);
      }
    }
    // Merge the nav lines (with the README-named icons), the R2 binding,
    // and the gated upload check.
    try {
      const navPath = path.join(workdir, "pages/_nav.ts");
      let nav = await readFile(navPath, "utf8");
      nav = replaceOnce(nav, COMBINED_NAV_IMPORT_ANCHOR, COMBINED_NAV_IMPORT, "pages/_nav.ts import");
      nav = replaceOnce(nav, COMBINED_NAV_ANCHOR, `${COMBINED_NAV_ANCHOR}\n${COMBINED_NAV_LINES}`, "pages/_nav.ts NAV");
      await writeFile(navPath, nav);
      const configPath = path.join(workdir, "void.config.ts");
      let config = await readFile(configPath, "utf8");
      config = replaceOnce(config, COMBINED_R2_ANCHOR, `${COMBINED_R2_ANCHOR}\n${COMBINED_R2_LINE}`, "void.config.ts r2_buckets");
      await writeFile(configPath, config);
      const photosPath = path.join(workdir, "pages/photos.server.ts");
      let photos = await readFile(photosPath, "utf8");
      photos = replaceOnce(
        photos,
        COMBINED_GATE_IMPORT_ANCHOR,
        `${COMBINED_GATE_IMPORT_ANCHOR}\n${COMBINED_GATE_IMPORT_LINE}`,
        "pages/photos.server.ts import",
      );
      photos = replaceOnce(photos, COMBINED_GATE_ANCHOR, COMBINED_GATE_BODY, "pages/photos.server.ts canUpload");
      await writeFile(photosPath, photos);
    } catch (e) {
      return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
    if (Object.keys(dependencies).length > 0) {
      const pkgPath = path.join(workdir, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { dependencies?: Record<string, string> };
      pkg.dependencies = { ...(pkg.dependencies ?? {}), ...dependencies };
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    }
    for (const cmd of [["bun", "install"], ["bun", "run", "check"], ["bun", "run", "build"]] as const) {
      const { exit, log } = await run([...cmd], workdir);
      if (exit !== 0) {
        return { name, ok: false, detail: `\`${cmd.join(" ")}\` failed in ${workdir}:\n${tail(log)}` };
      }
    }
    return { name, ok: true, detail: "install + check + build passed" };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    if (!keep) await Bun.$`rm -rf ${workdir}`.quiet().nothrow();
    else console.log(`  (kept ${workdir})`);
  }
}
async function checkExample(examplesDir: string, dirName: string, keep: boolean): Promise<CheckResult> {
  const dir = path.join(examplesDir, dirName);
  let files: OverlayFile[];
  try {
    files = await collectFiles(dir);
  } catch (e) {
    return { name: dirName, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  if (files.length > MAX_FILES)
    return { name: dirName, ok: false, detail: `${files.length} files exceeds limit of ${MAX_FILES}` };
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES)
      return { name: dirName, ok: false, detail: `${f.rel} is ${f.size} bytes (limit ${MAX_FILE_BYTES})` };
  }
  if (!files.some((f) => f.rel === "README.md")) return { name: dirName, ok: false, detail: "README.md missing" };
  const metaFile = files.find((f) => f.rel === "example.json");
  if (!metaFile) return { name: dirName, ok: false, detail: "example.json missing" };
  let meta: ExampleMeta;
  try {
    const { meta: m, error } = validateMeta(JSON.parse(await readFile(metaFile.abs, "utf8")), dirName);
    if (error) return { name: dirName, ok: false, detail: error };
    meta = m!;
  } catch (e) {
    return { name: dirName, ok: false, detail: `example.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Prove it builds on a fresh template copy.
  const templateDir = path.join(ROOT, "templates", meta.template);
  if (!(await isDir(templateDir))) return { name: dirName, ok: false, detail: `template missing: templates/${meta.template}` };
  const workdir = await mkdtemp(path.join(tmpdir(), `check-example-${meta.name}-`));
  try {
    await copyTemplate(templateDir, workdir);
    for (const f of files) {
      if (f.rel === "example.json" || f.rel === "README.md") continue;
      const dest = path.join(workdir, f.rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(f.abs, dest);
    }
    if (meta.dependencies && Object.keys(meta.dependencies).length > 0) {
      const pkgPath = path.join(workdir, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { dependencies?: Record<string, string> };
      pkg.dependencies = { ...(pkg.dependencies ?? {}), ...meta.dependencies };
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    }
    if (dirName === "newsletter") {
      const configPath = path.join(workdir, "void.config.ts");
      let config = await readFile(configPath, "utf8");
      config = replaceOnce(
        config,
        NEWSLETTER_D1_ANCHOR,
        `${NEWSLETTER_D1_ANCHOR}\n${NEWSLETTER_D1_LINE}`,
        "void.config.ts d1_databases",
      );
      await writeFile(configPath, config);
    }
    for (const cmd of [["bun", "install"], ["bun", "run", "check"], ["bun", "run", "build"]] as const) {
      const { exit, log } = await run([...cmd], workdir);
      if (exit !== 0) {
        return { name: dirName, ok: false, detail: `\`${cmd.join(" ")}\` failed in ${workdir}:\n${tail(log)}` };
      }
    }
    return { name: dirName, ok: true, detail: "install + check + build passed" };
  } catch (e) {
    return { name: dirName, ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    if (!keep) await Bun.$`rm -rf ${workdir}`.quiet().nothrow();
    else console.log(`  (kept ${workdir})`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    return;
  }
  let examplesDir = process.env["EXAMPLES_DIR"];
  let positional: string | undefined;
  const only: string[] = [];
  let keep = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--examples-dir") examplesDir = argv[++i];
    else if (arg.startsWith("--examples-dir=")) examplesDir = arg.slice("--examples-dir=".length);
    else if (arg === "--example") only.push(argv[++i]!);
    else if (arg.startsWith("--example=")) only.push(arg.slice("--example=".length));
    else if (arg === "--keep") keep = true;
    else if (arg.startsWith("-")) fail(`unknown flag ${arg} (see --help)`);
    else if (positional === undefined) positional = arg;
    else fail(`unexpected argument ${arg} (see --help)`);
  }
  const dir = path.resolve(ROOT, positional ?? examplesDir ?? "examples");
  if (!(await isDir(dir))) {
    if (positional ?? examplesDir) fail(`examples directory not found: ${dir}`);
    console.log(`no examples/ directory at ${dir} — nothing to check.`);
    return;
  }
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => !e.isSymbolicLink() && e.isDirectory())
    .map((e) => e.name)
    .filter((n) => only.length === 0 || only.includes(n))
    .sort();
  for (const name of only) {
    if (name === COMBINED.name) continue;
    const full = path.join(dir, name);
    // stat follows symlinks, so check the link itself first: a symlinked
    // directory is never an example, and must fail loudly instead of
    // passing silently when the entries filter skips it below.
    if ((await lstat(full).catch(() => null))?.isSymbolicLink())
      fail(`--example ${name}: symlinks are not examples`);
    if (!(await isDir(full))) fail(`--example ${name}: no such directory in ${dir}`);
  }
  if (entries.length === 0 && !(only.length === 0 || only.includes(COMBINED.name))) {
    console.log("no examples to check.");
    return;
  }
  console.log(`checking ${entries.length} example(s) in ${dir}`);
  const results: CheckResult[] = [];
  for (const name of entries) {
    console.log(`\n==> ${name}`);
    const r = await checkExample(dir, name, keep);
    results.push(r);
    console.log(`  ${r.ok ? "PASS" : "FAIL"}: ${r.detail.split("\n")[0]}`);
    if (!r.ok && r.detail.includes("\n")) console.log(tail(r.detail, LOG_TAIL_LINES));
  }
  if (only.length === 0 || only.includes(COMBINED.name)) {
    console.log(`\n==> ${COMBINED.name} (${COMBINED.members.join(" + ")})`);
    const r = await checkCombined(dir, keep);
    results.push(r);
    console.log(`  ${r.ok ? "PASS" : "FAIL"}: ${r.detail.split("\n")[0]}`);
    if (!r.ok && r.detail.includes("\n")) console.log(tail(r.detail, LOG_TAIL_LINES));
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} examples passed`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (passed !== results.length) process.exit(1);
}

await main();
