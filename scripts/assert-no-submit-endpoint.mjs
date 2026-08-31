import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const forbidden = ["request" + "_submit"];

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

for (const file of await filesUnder("dist")) {
  if (![".html", ".js", ".css", ".json", ".map"].includes(extname(file))) continue;
  const content = await readFile(file, "utf8");
  for (const value of forbidden) {
    if (content.includes(value)) {
      throw new Error(`M1 safety failure: ${value} found in ${file}`);
    }
  }
}

console.log("M1 safety check passed: production artifact has no complaint submission endpoint.");
