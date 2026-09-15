"use client";
/* eslint-disable @next/next/no-img-element -- The local Worker serves catalog CDN images without an image optimizer. */
import { useState } from "react";
import { gameAsset, type AssetKind } from "@/lib/game-assets";

export function GameImage({ kind, code, label, className = "" }: {
  kind: AssetKind; code: number | null; label?: string; className?: string;
}) {
  const asset = gameAsset(kind, code);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const name = asset?.name ?? label ?? (code === null ? "미제공" : `코드 ${code}`);
  const source = asset?.image;
  return <span className={`game-image ${className} grade-${asset?.grade?.toLowerCase() ?? "unknown"}`}
    title={`${name}${code === null ? "" : ` · ${code}`}`}>
    {source && failedSource !== source ? <img src={source} alt={name} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
      : <span className="asset-fallback" role="img" aria-label={`${name} · 이미지 없음`}>{code === null ? "—" : kind === "characters" ? name.slice(0, 1) : code}</span>}
  </span>;
}
