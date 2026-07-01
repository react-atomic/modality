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
});
