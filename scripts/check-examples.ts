#!/usr/bin/env bun
// Checks every example under examples/ against the contract:
//
//   examples/<name>/example.json + README.md + files at app-relative paths
//
// For each example it validates metadata and file limits, then proves the
// files work: copy templates/<template> to a temp dir, apply the example
// with scripts/apply-example.ts (plus its `requires`), and run `bun
// install`, `bun run check`, and `bun run build` there. The two combined
// cases (`passkeys`+`photos`+`list-form` on the app template,
// `newsletter`+`blog` on the website template) prove multi-example applies
// the same way.
//
// Usage:
//   bun scripts/check-examples.ts [--examples-dir <dir>] [--example <name>...] [--keep]
//   bun run check-examples
//
// The examples directory defaults to <repo>/examples and can be overridden
// with the first positional arg, --examples-dir, or EXAMPLES_DIR (in that
// order). --example limits the run to named examples or combined cases
// (repeatable). --keep leaves the temp dirs behind and prints their paths
// for debugging.
import { mkdtemp, mkdir, readdir, readFile, copyFile, lstat, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApplyError, applyExamples } from "./apply-example.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES = 30;
const LOG_TAIL_LINES = 50;
// Template build output / installs are never part of the overlay source.
const COPY_SKIP: Record<string, true> = { node_modules: true, dist: true };

interface OverlayFile {
  abs: string;
  rel: string;
  size: number;
}

function usage(): string {
  return [
    "usage: check-examples.ts [--examples-dir <dir>] [--example <name>...] [--keep]",
    "",
    "Checks every example in <dir> (default <repo>/examples): validates the",
    "metadata and file limits, applies it to a fresh template copy with",
    "scripts/apply-example.ts, and runs `bun install`, `bun run check` and",
    "`bun run build` there. Also checks the combined cases (app:",
    "`passkeys`+`photos`+`list-form`; website: `newsletter`+`blog`).",
    "With --example, only the named examples/cases run (repeatable).",
    "With --keep, the temp dirs are left behind for debugging.",
  ].join("\n");
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
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
  return lines.slice(-n).join("\n");
}

async function run(cmd: string[], cwd: string): Promise<{ exit: number; log: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exit, log: `$ ${cmd.join(" ")}\n${stdout}${stderr}` };
}

// Recursively list regular files under dir, rejecting symlinks anywhere.
async function collectFiles(dir: string, root: string = dir, out: OverlayFile[] = []): Promise<OverlayFile[]> {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`${path.relative(root, abs)} is a symlink (examples ship plain files only)`);
    if (COPY_SKIP[entry.name]) continue;
    if (entry.isDirectory()) await collectFiles(abs, root, out);
    else if (entry.isFile()) out.push({ abs, rel: path.relative(root, abs), size: (await stat(abs)).size });
  }
  return out;
}

// Copy a template tree minus build output and installs.
async function copyTemplate(src: string, dest: string): Promise<void> {
  for (const f of await collectFiles(src)) {
    const target = path.join(dest, f.rel);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(f.abs, target);
  }
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

// Combined applies: several examples on the same app, the way an agent
// merges them — the apply engine resolves `requires`, renumbers
// migrations, and merges nav lines and bindings.
const COMBINED: { name: string; template: "app" | "website"; members: string[] }[] = [
  { name: "combined", template: "app", members: ["passkeys", "photos", "list-form"] },
  { name: "website-combined", template: "website", members: ["newsletter", "blog"] },
];

async function runBuild(workdir: string): Promise<CheckResult | null> {
  for (const cmd of [["bun", "install"], ["bun", "run", "check"], ["bun", "run", "build"]] as const) {
    const { exit, log } = await run([...cmd], workdir);
    if (exit !== 0) {
      return { name: "", ok: false, detail: `\`${cmd.join(" ")}\` failed in ${workdir}:\n${tail(log)}` };
    }
  }
  return null;
}

async function checkCase(
  examplesDir: string,
  name: string,
  template: "app" | "website",
  members: string[],
  keep: boolean,
): Promise<CheckResult> {
  for (const member of members) {
    let files: OverlayFile[];
    try {
      files = await collectFiles(path.join(examplesDir, member));
    } catch (e) {
      return { name, ok: false, detail: `${member}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (files.length === 0) return { name, ok: false, detail: `${member}: no files` };
    if (files.length > MAX_FILES)
      return { name, ok: false, detail: `${member}: ${files.length} files exceeds limit of ${MAX_FILES}` };
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES)
        return { name, ok: false, detail: `${member}/${f.rel} is ${f.size} bytes (limit ${MAX_FILE_BYTES})` };
    }
    if (!files.some((f) => f.rel === "README.md")) return { name, ok: false, detail: `${member}: README.md missing` };
    if (!files.some((f) => f.rel === "example.json")) return { name, ok: false, detail: `${member}: example.json missing` };
  }

  const templateDir = path.join(ROOT, "templates", template);
  if (!(await isDir(templateDir))) return { name, ok: false, detail: `template missing: templates/${template}` };
  const workdir = await mkdtemp(path.join(tmpdir(), `check-example-${name}-`));
  try {
    await copyTemplate(templateDir, workdir);
    try {
      const result = await applyExamples({ treeDir: workdir, examplesDir, names: members, template });
      console.log(`  applied: ${result.added.join(", ")} (${result.files.length} files)`);
    } catch (e) {
      if (e instanceof ApplyError) return { name, ok: false, detail: `apply failed: ${e.message}` };
      throw e;
    }
    const failed = await runBuild(workdir);
    if (failed) return { ...failed, name };
    return { name, ok: true, detail: "install + check + build passed" };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    if (!keep) await Bun.$`rm -rf ${workdir}`.quiet().nothrow();
    else console.log(`  (kept ${workdir})`);
  }
}

async function exampleTemplate(examplesDir: string, dirName: string): Promise<{ template?: "app" | "website"; error?: string }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(examplesDir, dirName, "example.json"), "utf8"));
  } catch (e) {
    return { error: `example.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const template = typeof raw === "object" && raw !== null && "template" in raw ? raw.template : undefined;
  if (template !== "app" && template !== "website") return { error: `example.json "template" must be "app" or "website"` };
  return { template };
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
    if (COMBINED.some((c) => c.name === name)) continue;
    const full = path.join(dir, name);
    // stat follows symlinks, so check the link itself first: a symlinked
    // directory is never an example, and must fail loudly instead of
    // passing silently when the entries filter skips it below.
    if ((await lstat(full).catch(() => null))?.isSymbolicLink())
      fail(`--example ${name}: symlinks are not examples`);
    if (!(await isDir(full))) fail(`--example ${name}: no such directory in ${dir}`);
  }
  const combined = COMBINED.filter((c) => only.length === 0 || only.includes(c.name));
  if (entries.length === 0 && combined.length === 0) {
    console.log("no examples to check.");
    return;
  }
  console.log(`checking ${entries.length} example(s) in ${dir}`);
  const results: CheckResult[] = [];
  for (const name of entries) {
    console.log(`\n==> ${name}`);
    const { template, error } = await exampleTemplate(dir, name);
    if (error || !template) {
      results.push({ name, ok: false, detail: error ?? "unknown template" });
      console.log(`  FAIL: ${error ?? "unknown template"}`);
      continue;
    }
    const r = await checkCase(dir, name, template, [name], keep);
    results.push(r);
    console.log(`  ${r.ok ? "PASS" : "FAIL"}: ${r.detail.split("\n")[0]}`);
    if (!r.ok && r.detail.includes("\n")) console.log(tail(r.detail, LOG_TAIL_LINES));
  }
  for (const c of combined) {
    console.log(`\n==> ${c.name} (${c.members.join(" + ")})`);
    const r = await checkCase(dir, c.name, c.template, c.members, keep);
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
