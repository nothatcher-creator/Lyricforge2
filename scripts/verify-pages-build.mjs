import fs from "node:fs";
import path from "node:path";
const root = path.resolve("dist/client");
for (const relative of [
  "index.html",
  "workers/analysis.js",
  "workers/transcription.js",
  "catalog/index.json",
  "catalog/assets/effect/catalog.effect.neon-pulse/1.0.0/asset.lyricforge-asset",
  "catalog/assets/transition/catalog.transition.soft-glitch/1.0.0/asset.lyricforge-asset",
  "catalog/assets/text-animation/catalog.animation.starlight-rise/1.0.0/asset.lyricforge-asset",
  "catalog/assets/font/catalog.font.bebas-neue/1.0.0/asset.lyricforge-asset"
]) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Pages artifact: ${relative}`);
}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
if(!html.includes("LyricForge")) throw new Error("LyricForge marker missing from index.html");
if(html.includes("Cloudflare Local Explorer")) throw new Error("Wrong Cloudflare explorer artifact exported");
if(!html.includes("/Lyricforge2/_next/")) throw new Error("GitHub Pages asset prefix missing");
const worker=fs.readFileSync(path.join(root,"workers/transcription.js"),"utf8");
if(!worker.includes("/Lyricforge2/workers/")) throw new Error("Worker WASM path is not prefixed");
if(fs.existsSync(path.join(root,"Lyricforge2"))) throw new Error("Nested Lyricforge2 output directory remains after normalization");
console.log("GitHub Pages artifact validation passed.");
