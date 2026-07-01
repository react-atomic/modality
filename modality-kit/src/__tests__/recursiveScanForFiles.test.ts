import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { recursiveScanForFiles } from "../recursiveScanForFiles";

describe("recursiveScanForFiles", () => {
  const baseDir = import.meta.dir + "/../.."; // project root

  it("should find files in target folder", () => {
    const files = recursiveScanForFiles(baseDir, {
      targetFolderName: "src",
      fileExtensions: [".ts"],
    });

    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.fullPath.includes("/src/"))).toBe(true);
    expect(files.every((f) => f.fullPath.endsWith(".ts"))).toBe(true);
  });

  it("should exclude files starting with dot or underscore", () => {
    const files = recursiveScanForFiles(baseDir, {
      targetFolderName: "src",
      fileExtensions: [".ts"],
    });

    expect(files.every((f) => !f.filename.startsWith("."))).toBe(true);
    expect(files.every((f) => !f.filename.includes("/."))).toBe(true);
  });

  it("should return sorted results by filename", () => {
    const files = recursiveScanForFiles(baseDir, {
      targetFolderName: "src",
      fileExtensions: [".ts"],
    });

    const filenames = files.map((f) => f.filename);
    const sorted = [...filenames].sort((a, b) => a.localeCompare(b));

    expect(filenames).toEqual(sorted);
  });

  it("should return empty array when target folder not found", () => {
    const files = recursiveScanForFiles(baseDir, {
      targetFolderName: "nonexistent-folder-xyz",
      fileExtensions: [".md"],
    });

    expect(files).toEqual([]);
  });

  it("should filter by custom fileNameFilter", () => {
    const files = recursiveScanForFiles(baseDir, {
      targetFolderName: "src",
      fileExtensions: [".ts"],
      fileNameFilter: (name) => name.includes("index"),
    });

    expect(files.every((f) => f.filename.includes("index"))).toBe(true);
  });
});

describe("recursiveScanForFiles symlink containment", () => {
  // root/templates/{good.md, sub/nested.md, mirror->sub, escape->outside}
  // outside/leak.md  (lives beside root, NOT under it)
  let workspace: string;
  let root: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), "scan-symlink-"));
    root = join(workspace, "root");
    const templates = join(root, "templates");
    const sub = join(templates, "sub");
    const outside = join(workspace, "outside");

    mkdirSync(sub, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(templates, "good.md"), "good");
    writeFileSync(join(sub, "nested.md"), "nested");
    writeFileSync(join(outside, "leak.md"), "leak");

    symlinkSync(outside, join(templates, "escape")); // escapes the tree
    symlinkSync(sub, join(templates, "mirror")); // in-tree, aliases sub
  });

  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("follows in-tree symlinks without re-collecting deduped dirs", () => {
    const files = recursiveScanForFiles(root, {
      targetFolderName: "templates",
      fileExtensions: [".md"],
      searchInSubfolders: true,
    });

    const nested = files.filter((f) => f.fullPath.endsWith("nested.md"));
    expect(nested.length).toBe(1); // sub scanned once, mirror deduped
  });

  it("returns empty array for a nonexistent base directory", () => {
    const files = recursiveScanForFiles(join(workspace, "does-not-exist"), {
      targetFolderName: "templates",
      fileExtensions: [".md"],
    });

    expect(files).toEqual([]);
  });

  it("excludes out-of-tree symlinks when restrictToBaseDir is true", () => {
    const files = recursiveScanForFiles(root, {
      targetFolderName: "templates",
      fileExtensions: [".md"],
      searchInSubfolders: true,
      restrictToBaseDir: true,
    });

    const filenames = files.map((f) => f.filename);
    // 'escape' is a symlink to outside/ which lives beside root/, not under it
    expect(filenames).not.toContain("templates/escape/leak.md");
    // Legitimate in-tree entries still found
    expect(filenames).toContain("templates/good.md");
    expect(filenames).toContain("templates/sub/nested.md");
  });

  it("returns empty array for a nonexistent base when restrictToBaseDir is true", () => {
    const files = recursiveScanForFiles(join(workspace, "does-not-exist"), {
      targetFolderName: "templates",
      fileExtensions: [".md"],
      restrictToBaseDir: true,
    });

    expect(files).toEqual([]);
  });
});

describe("recursiveScanForFiles sibling-alias dedup (searching vs collect)", () => {
  // Regression for a silent empty-result bug: a sibling tree that sorts before
  // the target folder and symlinks *into* the target's children. The scanner
  // walks the sibling in "searching" mode first (collection off) and, before
  // this fix, recorded each aliased real dir in the visited set — so the later
  // "collect" pass over the real target folder skipped every child as
  // already-visited and returned zero files, with no error thrown.
  //
  //   root/aaa-categories/browser -> ../skills/foo   (searching-mode alias)
  //   root/skills/foo/SKILL.md                        (the real, collectable file)
  //
  // 'aaa-categories' is chosen and created first so it is traversed before
  // 'skills' on both hash-ordered (APFS) and creation-ordered (tmpfs) readdir.
  let workspace: string;
  let root: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), "scan-sibling-alias-"));
    root = join(workspace, "root");
    mkdirSync(join(root, "aaa-categories"), { recursive: true }); // sibling first
    mkdirSync(join(root, "skills", "foo"), { recursive: true });
    writeFileSync(join(root, "skills", "foo", "SKILL.md"), "skill");
    // Symlink from the sibling into a real skill folder — reached while still
    // searching for the target folder (the entry is named 'browser', not 'skills').
    symlinkSync(join("..", "skills", "foo"), join(root, "aaa-categories", "browser"));
  });

  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("still collects a target file aliased from a searching-mode sibling", () => {
    const files = recursiveScanForFiles(root, {
      targetFolderName: "skills",
      fileNameFilter: (name) => name === "SKILL.md",
      searchInSubfolders: true,
      fileExtensions: [".md"],
    });

    const skillFiles = files.filter((f) => f.fullPath.endsWith("SKILL.md"));
    expect(skillFiles.length).toBe(1); // sibling searching-pass must not deny the collect-pass
  });
});
