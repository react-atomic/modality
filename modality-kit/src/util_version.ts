type Version = `${number}.${number}.${number}`;
export async function loadVersion(packageJsonPath: string): Promise<Version> {
  const packageJson = require(packageJsonPath);
  try {
    const version = packageJson.version as Version;
    // Validate format: x.y.z
    if (/^\d+\.\d+\.\d+$/.test(version)) return version;
    console.warn(`Invalid version format in package.json: ${version}`);
    return "0.0.0";
  } catch (err) {
    console.error("Error loading package.json version:", err);
    return "0.0.0";
  }
}

/*
(async () => {
  console.log(await loadVersion("../package.json"));
})();
*/
