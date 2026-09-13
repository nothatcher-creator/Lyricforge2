import fs from 'node:fs';
import path from 'node:path';
import {assertTrustedCatalogSource,buildAssetPackage,gitBlobSha1,remoteManifestFromSource,sortCatalogItems,stableJson} from './catalog-lib.mjs';

const root=path.resolve('public/catalog');
const assetsRoot=path.join(root,'assets');
const encoder=new TextEncoder();

function walk(dir){
 if(!fs.existsSync(dir))return [];
 const output=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())output.push(...walk(full));
  else if(entry.isFile()&&entry.name==='source.json')output.push(full);
 }
 return output;
}
async function fetchPinnedFile(file){
 if(typeof file.url!=='string'||!file.url.startsWith('https://'))throw new Error(`Remote catalog source ${file.path} must use HTTPS`);
 const response=await fetch(file.url);
 if(!response.ok)throw new Error(`Unable to download ${file.path}: HTTP ${response.status}`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(file.gitBlobSha1&&gitBlobSha1(bytes)!==file.gitBlobSha1)throw new Error(`Pinned upstream Git blob hash mismatch for ${file.path}`);
 return bytes;
}
async function payloadsFor(source,dir){
 const payloads={};
 if(source.preset)payloads['preset.json']={mime:'application/json',bytes:encoder.encode(stableJson(source.preset))};
 for(const file of source.files??[]){
  if(typeof file.path!=='string'||typeof file.mime!=='string')throw new Error(`Invalid payload declaration for ${source.id}`);
  const bytes=file.url?await fetchPinnedFile(file):new Uint8Array(fs.readFileSync(path.join(dir,file.file??file.path)));
  payloads[file.path]={mime:file.mime,bytes};
 }
 return payloads;
}

const manifests=[];
const published=[];
for(const sourcePath of walk(assetsRoot)){
 const dir=path.dirname(sourcePath);
 const source=assertTrustedCatalogSource(JSON.parse(fs.readFileSync(sourcePath,'utf8')));
 if(source.publishedAt){if(Number.isNaN(Date.parse(source.publishedAt)))throw new Error(`Invalid publishedAt for ${source.id}`);published.push(source.publishedAt);}
 const previewPath=path.join(dir,source.preview.file);
 if(!fs.existsSync(previewPath))throw new Error(`Missing preview for ${source.id}: ${source.preview.file}`);
 const payloads=await payloadsFor(source,dir);
 const built=buildAssetPackage(source,payloads);
 fs.writeFileSync(path.join(dir,'asset.lyricforge-asset'),built.bytes);
 const relativeDir=path.relative(root,dir).split(path.sep).join('/');
 const manifest=remoteManifestFromSource(source,built,relativeDir);
 fs.writeFileSync(path.join(dir,'manifest.json'),stableJson(manifest));
 manifests.push(manifest);
}
const generatedAt=published.sort().at(-1)??'2026-09-13T00:00:00.000Z';
const items=sortCatalogItems(manifests);
const seen=new Set();
for(const item of items){const key=`${item.type}:${item.id}@${item.version}`;if(seen.has(key))throw new Error(`Duplicate catalog asset version: ${key}`);seen.add(key);}
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'index.json'),stableJson({schemaVersion:1,catalogId:'official',generatedAt,items}));
console.log(`Built official LyricForge catalog with ${items.length} assets.`);
