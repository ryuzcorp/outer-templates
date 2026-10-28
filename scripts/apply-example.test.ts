// Behaviour tests for scripts/apply-example.ts: the golden fixtures in
// scripts/apply-fixtures/ (input tree + example → expected changed files,
// or an exact refusal message) plus unit tests for resolution, skips, and
// refusals. Run: bun test scripts/apply-example.test.ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApplyError, applyExamples, resolveExamples } from "./apply-example.ts";

const FIXTURES = path.resolve(import.meta.dir, "apply-fixtures");

async function snapshotTree(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(current: string, rel: string): Promise<void> {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const entryRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), entryRel);
      else if (entry.isFile()) out.set(entryRel, await readFile(path.join(current, entry.name), "utf8"));
    }
  }
  await walk(dir, "");
  return out;
}

async function copyTree(src: string, dest: string): Promise<void> {
  for (const [rel, content] of await snapshotTree(src)) {
    const target = path.join(dest, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function writeTree(dir: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

const NAV_TREE: Record<string, string> = {
  "pages/_nav.ts": `import { House, Settings } from "lucide"; // outer:nav-icons

export const NAV = [
  { href: "/", label: "Home", icon: House },
  // outer:nav-items — add_example inserts pages above this line
  { href: "/settings", label: "Settings", icon: Settings },
];
`,
  "void.config.ts": `export default {
  cloudflare: {
    name: "t",
    // outer:bindings — add_example inserts bindings above this line
  },
};
`,
  "package.json": `{"name": "t", "private": true}\n`,
};

describe("golden fixtures", () => {
  const cases = ["app-combined", "binding-skip", "website-bindings", "migration-renumber", "missing-marker", "conflict"];
  for (const name of cases) {
    test(name, async () => {
      const dir = path.join(FIXTURES, name);
      const request = (await readFile(path.join(dir, "request.json"), "utf8").then(JSON.parse)) as {
        template: "app" | "website";
        names: string[];
      };
      const workdir = await mkdtemp(path.join(tmpdir(), `apply-test-${name}-`));
      try {
        await copyTree(path.join(dir, "tree"), workdir);
        const before = await snapshotTree(workdir);
        let error: string | null = null;
        try {
          await applyExamples({ treeDir: workdir, examplesDir: path.join(dir, "examples"), names: request.names, template: request.template });
        } catch (e) {
          if (!(e instanceof ApplyError)) throw e;
          error = e.message;
        }
        const errorFile = path.join(dir, "expected-error.txt");
        let expectedError: string | null = null;
        try {
          expectedError = await readFile(errorFile, "utf8");
        } catch {
          // Success fixture.
        }
        if (expectedError !== null) {
          expect(error).toBe(expectedError);
          expect(await snapshotTree(workdir)).toEqual(before);
          return;
        }
        expect(error).toBeNull();
        const after = await snapshotTree(workdir);
        const changed = new Map<string, string>();
        for (const [rel, content] of after) {
          if (before.get(rel) !== content) changed.set(rel, content);
        }
        for (const rel of before.keys()) {
          expect(after.has(rel)).toBe(true);
        }
        const expected = await snapshotTree(path.join(dir, "expected"));
        expect(new Map(changed)).toEqual(expected);
      } finally {
        await rm(workdir, { recursive: true, force: true });
      }
    });
  }
});

describe("requires", () => {
  const examplesDir = path.resolve(import.meta.dir, "..", "examples");

  test("photos resolves passkeys first", async () => {
    const resolved = await resolveExamples(examplesDir, ["photos"]);
    expect(resolved.map((m) => m.name)).toEqual(["passkeys", "photos"]);
  });

  test("shared requires apply once", async () => {
    const resolved = await resolveExamples(examplesDir, ["photos", "passkeys"]);
    expect(resolved.map((m) => m.name)).toEqual(["passkeys", "photos"]);
  });

  test("cycle refuses", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "apply-test-cycle-"));
    try {
      await writeTree(dir, {
        "aa/example.json": JSON.stringify({ name: "aa", title: "A", summary: "A", template: "app", requires: ["bb"] }),
        "aa/pages/aa.ts": "export const a = 1;\n",
        "bb/example.json": JSON.stringify({ name: "bb", title: "B", summary: "B", template: "app", requires: ["aa"] }),
        "bb/pages/bb.ts": "export const b = 1;\n",
      });
      await expect(resolveExamples(dir, ["aa"])).rejects.toThrow("requires cycle: aa -> bb -> aa");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("chain deeper than 3 refuses", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "apply-test-depth-"));
    try {
      await writeTree(dir, {
        "aa/example.json": JSON.stringify({ name: "aa", title: "A", summary: "A", template: "app", requires: ["bb"] }),
        "aa/pages/aa.ts": "export const a = 1;\n",
        "bb/example.json": JSON.stringify({ name: "bb", title: "B", summary: "B", template: "app", requires: ["cc"] }),
        "bb/pages/bb.ts": "export const b = 1;\n",
        "cc/example.json": JSON.stringify({ name: "cc", title: "C", summary: "C", template: "app", requires: ["dd"] }),
        "cc/pages/cc.ts": "export const c = 1;\n",
        "dd/example.json": JSON.stringify({ name: "dd", title: "D", summary: "D", template: "app" }),
        "dd/pages/dd.ts": "export const d = 1;\n",
      });
      await expect(resolveExamples(dir, ["aa"])).rejects.toThrow("deeper than 3");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("apply", () => {
  test("wrong template refuses", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-template-"));
    try {
      await writeTree(workdir, NAV_TREE);
      await expect(
        applyExamples({
          treeDir: workdir,
          examplesDir: path.resolve(import.meta.dir, "..", "examples"),
          names: ["list-form"],
          template: "website",
        }),
      ).rejects.toThrow('example "list-form" is for the app template');
      expect([...(await snapshotTree(workdir)).keys()].sort()).toEqual(Object.keys(NAV_TREE).sort());
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("unknown example refuses", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-unknown-"));
    try {
      await writeTree(workdir, NAV_TREE);
      await expect(
        applyExamples({
          treeDir: workdir,
          examplesDir: path.resolve(import.meta.dir, "..", "examples"),
          names: ["nope"],
          template: "app",
        }),
      ).rejects.toThrow('unknown example "nope"');
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("second apply refuses as already applied", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-skip-"));
    try {
      await writeTree(workdir, {
        ...NAV_TREE,
        "void.config.ts": `export default {
  cloudflare: {
    name: "t",
    assets: {},
    // outer:bindings — add_example inserts bindings above this line
  },
};
`,
      });
      const request = {
        treeDir: workdir,
        examplesDir: path.resolve(import.meta.dir, "..", "examples"),
        names: ["newsletter"],
        template: "website" as const,
      };
      const first = await applyExamples(request);
      expect(first.added).toEqual(["newsletter"]);
      expect(first.files.length).toBeGreaterThan(0);
      const before = await snapshotTree(workdir);
      await expect(applyExamples(request)).rejects.toThrow("already applied");
      expect(await snapshotTree(workdir)).toEqual(before);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("conflicting file refuses without writing", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-conflict-"));
    try {
      await writeTree(workdir, { ...NAV_TREE, "pages/thing.ts": 'export const thing = "old";\n' });
      const examplesDir = await mkdtemp(path.join(tmpdir(), "apply-test-conflict-ex-"));
      try {
        await writeTree(examplesDir, {
          "clash/example.json": JSON.stringify({ name: "clash", title: "C", summary: "C", template: "app" }),
          "clash/pages/thing.ts": 'export const thing = "new";\n',
          "clash/pages/other.ts": "export const other = 1;\n",
        });
        const before = await snapshotTree(workdir);
        await expect(
          applyExamples({ treeDir: workdir, examplesDir, names: ["clash"], template: "app" }),
        ).rejects.toThrow("pages/thing.ts already exists with different content");
        expect(await snapshotTree(workdir)).toEqual(before);
      } finally {
        await rm(examplesDir, { recursive: true, force: true });
      }
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("different binding value refuses", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-binding-"));
    try {
      await writeTree(workdir, {
        ...NAV_TREE,
        "void.config.ts": `export default {
  cloudflare: {
    name: "t",
    r2_buckets: [{ binding: "PHOTOS", bucket_name: "other" }],
    // outer:bindings — add_example inserts bindings above this line
  },
};
`,
      });
      await expect(
        applyExamples({
          treeDir: workdir,
          examplesDir: path.resolve(import.meta.dir, "..", "examples"),
          names: ["photos"],
          template: "app",
        }),
      ).rejects.toThrow("already declares r2_buckets with a different value");
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  test("example.json dependencies are rejected", async () => {
    const examplesDir = await mkdtemp(path.join(tmpdir(), "apply-test-dep-ex-"));
    const workdir = await mkdtemp(path.join(tmpdir(), "apply-test-dep-"));
    try {
      await writeTree(examplesDir, {
        "need/example.json": JSON.stringify({
          name: "need",
          title: "N",
          summary: "N",
          template: "app",
          dependencies: { "some-pkg": "^2.0.0" },
        }),
        "need/README.md": "# Need\n",
        "need/pages/need.ts": "export const need = 1;\n",
      });
      await writeTree(workdir, NAV_TREE);
      await expect(applyExamples({ treeDir: workdir, examplesDir, names: ["need"], template: "app" })).rejects.toThrow(
        '"dependencies" is not supported',
      );
    } finally {
      await rm(examplesDir, { recursive: true, force: true });
      await rm(workdir, { recursive: true, force: true });
    }
  });
});
