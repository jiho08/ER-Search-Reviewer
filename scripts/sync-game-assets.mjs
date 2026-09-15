import { mkdir, writeFile } from "node:fs/promises";

// Manual refresh only. No player records or credentials are sent to this catalog.
const base = "https://er.dakgg.io/api/v1/data/";
const collections = { characters: "characters", items: "items", "trait-skills": "traitSkills", "tactical-skills": "tacticalSkills", tiers: "tiers", seasons: "seasons" };
const output = { fetchedAt: new Date().toISOString(), sources: [], characters: {}, items: {}, traits: {}, tactical: {}, tiers: {}, seasons: {} };
function imageUrl(value) {
  const url = new URL(value, "https://cdn.dak.gg");
  if (url.protocol !== "https:" || url.hostname !== "cdn.dak.gg") throw new Error("Unexpected asset host");
  return url.href;
}
for (const [endpoint, key] of Object.entries(collections)) {
  const url = `${base}${endpoint}?hl=ko`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  const data = (await response.json())[key];
  if (!Array.isArray(data) || !data.length) throw new Error(`Invalid ${endpoint} catalog`);
  const target = endpoint === "trait-skills" ? "traits" : endpoint === "tactical-skills" ? "tactical" : endpoint;
  for (const item of data) {
    if (!Number.isSafeInteger(item.id) || typeof item.name !== "string") continue;
    if (endpoint === "seasons") { output.seasons[item.id] = item.name; continue; }
    if (!item.imageUrl) continue;
    output[target][item.id] = { name: item.name, image: imageUrl(item.imageUrl),
      ...(item.grade && typeof item.grade === "string" ? { grade: item.grade } : {}),
    };
  }
  output.sources.push(url);
}
await mkdir(new URL("../lib/generated/", import.meta.url), { recursive: true });
await writeFile(new URL("../lib/generated/game-assets.json", import.meta.url), JSON.stringify(output));
console.log("Saved catalog:", Object.fromEntries(["characters", "items", "traits", "tiers"].map((key) => [key, Object.keys(output[key]).length])));
