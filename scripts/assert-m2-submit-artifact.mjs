import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return nested.flat();
}

let artifact = "";
for (const file of await filesUnder("dist")) {
  if (![".html", ".js", ".json"].includes(extname(file))) continue;
  artifact += await readFile(file, "utf8");
}

for (const required of ["request_submit", "custom_field_25876", "uploadedfile"]) {
  if (!artifact.includes(required)) {
    throw new Error(`M2 build failure: required submission marker ${required} is missing.`);
  }
}

console.log("M2 artifact check passed: real submission adapter is present.");
