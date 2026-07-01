import { readdirSync, statSync, realpathSync } from "fs";
import { join, extname } from "path";

interface ScanOptions {
  targetFolderName: string; // Name of folder to scan (e.g., 'templates', 'protocols', 'skills')
  fileExtensions?: string[]; // Extensions to include (default: all files)
  fileNameFilter?: (name: string) => boolean; // Optional filter function (default: matches any file)
  excludePatterns?: string[]; // Patterns to exclude (default: entries starting with '.' or '__')
  searchInSubfolders?: boolean; // If true, recursively search subdirectories of target folder for matching files
}

/**
 * Generic recursive file finder that scans directories for files matching criteria
 * Internal utility for scanning templates, protocols, and other resource types
 */
export interface ScannedFile {
  filename: string; // Relative path within base directory (e.g., "templates/my-tmpl.md")
  fullPath: string; // Absolute file system path
}

/**
 * Recursively scan directory for files in folders matching criteria
 * @param baseDir - Base directory to start scanning from
 * @param options - Scan configuration
 * @returns Array of found files sorted by filename
 */
export function recursiveScanForFiles(
  baseDir: string,
  options: ScanOptions
): ScannedFile[] {
  const files: ScannedFile[] = [];
  const {
    targetFolderName,
    fileExtensions,
    fileNameFilter = () => true,
    excludePatterns = [".", "__"],
    searchInSubfolders = false,
  } = options;

  // O(1) lookup instead of O(e) with .some()
  const extensionSet = new Set(fileExtensions);
  const errors: { path: string; error: string }[] = [];
  // Track resolved real paths already entered to prevent re-scanning
  // the same directory through different symlink chains
  const visitedRealDirs = new Set<string>();

  function scanDirectory(
    dir: string,
    relativePath: string = "",
    isSearchingForTarget: boolean = true
  ): void {
    // Resolve real path and skip if already scanned
    try {
      const realDir = realpathSync(dir);
      if (visitedRealDirs.has(realDir)) return;
      visitedRealDirs.add(realDir);
    } catch {
      return; // can't resolve — skip
    }

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (e) {
      errors.push({ path: dir, error: (e as Error).message });
      return;
    }
    for (const entry of entries) {
      try {
        if (excludePatterns.some((pattern) => entry.startsWith(pattern))) {
          continue;
        }

        const fullPath = join(dir, entry);
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;

        const isDirectory = statSync(fullPath, {
          throwIfNoEntry: false,
        })?.isDirectory();

        if (isSearchingForTarget) {
          // Phase 1: Looking for target folder
          if (isDirectory) {
            scanDirectory(fullPath, relPath, entry !== targetFolderName);
          }
        } else if (isDirectory) {
          // Phase 2: Inside target folder, recurse into subfolders if enabled
          if (searchInSubfolders) {
            scanDirectory(fullPath, relPath, false);
          }
        } else if (
          (!fileExtensions || extensionSet.has(extname(entry))) &&
          fileNameFilter(entry)
        ) {
          files.push({ filename: relPath, fullPath });
        }
      } catch (e) {
        errors.push({ path: join(dir, entry), error: (e as Error).message });
      }
    }
  }

  scanDirectory(baseDir, "", true);
  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.path}: ${e.error}`).join("\n");
    throw new Error(`Error scanning directory:\n${detail}`);
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}
