import { describe, it, expect } from "bun:test";
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
