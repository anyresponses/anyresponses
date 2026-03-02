const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(
  rootDir,
  "packages",
  "core",
  "reference",
  "providers.json",
);
const targetDir = path.join(rootDir, "apps", "frontend", "src", "data");
const targetPath = path.join(targetDir, "providers.json");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

console.log(`Synced providers.json to ${targetPath}`);
