import catalog from "./generated/game-assets.json";

export interface GameAsset { name: string; image: string; grade?: string }
export type AssetKind = "characters" | "items" | "traits" | "tactical" | "tiers";
export function gameAsset(kind: AssetKind, code: number | null): GameAsset | null {
  if (code === null) return null;
  return (catalog[kind] as Record<string, GameAsset>)[String(code)] ?? null;
}
