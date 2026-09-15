import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';

export const TRUSTED_CATALOG_RUNTIMES=new Set([
 'animation.fade','animation.slide','animation.blur','animation.scale-punch','animation.tracking','animation.word-pop','animation.character-cascade','animation.spin','animation.tilt-3d','animation.wipe-reveal','animation.pixel-dissolve','animation.glitch-reveal','animation.pulse','animation.float','animation.bounce','animation.shake','animation.wave','animation.neon-flicker','animation.breathing-glow','animation.rgb-drift','animation.sway-3d','animation.beat-pulse',
 'effect.glow','effect.bloom','effect.drop-shadow','effect.outline','effect.blur','effect.sharpen','effect.grain','effect.vignette','effect.brightness','effect.contrast','effect.saturation','effect.hue-shift','effect.duotone','effect.posterize','effect.pixelate','effect.rgb-split','effect.vhs','effect.noise-displacement','effect.shake','effect.zoom-pulse','effect.light-streak','effect.glitch','effect.beat-reactive',
 'transition.crossfade','transition.dip-black','transition.dip-white','transition.blur-dissolve','transition.push','transition.slide','transition.wipe','transition.zoom','transition.spin','transition.flash','transition.glitch','transition.rgb-split','transition.pixel-dissolve','transition.film-burn','transition.light-leak','transition.mask-reveal',
]);
export const ALLOWED_CATALOG_MIME=new Set(['application/json','font/ttf','font/woff2','image/png','image/jpeg','image/webp','image/svg+xml','video/mp4','video/webm','text/plain']);
export const REDISTRIBUTABLE_FONT_LICENSES=new Set(['OFL-1.1','Apache-2.0']);
const FIXED_ZIP_TIME=new Date('1980-01-01T00:00:00.000Z');
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ASSET_TYPES=new Set(['font','effect','transition','text-animation']);
const LYRICFORGE_SOURCE_PREFIX='https://github.com/nothatcher-creator/Lyricforge2';

function sortValue(value){
 if(Array.isArray(value))return value.map(sortValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortValue(value[key])]));
 return value;
}
export function stableJson(value){return `${JSON.stringify(sortValue(value),null,2)}\n`;}
export function sha256Hex(bytes){return createHash('sha256').update(bytes).digest('hex');}
export function gitBlobSha1(bytes){return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');}

function compareSemVer(a,b){
 const left=a.split('.').map(Number),right=b.split('.').map(Number);
 for(let i=0;i<3;i++){if(left[i]!==right[i])return left[i]-right[i];}
 return 0;
}
export function sortCatalogItems(items){return [...items].sort((a,b)=>a.type.localeCompare(b.type)||a.id.localeCompare(b.id)||compareSemVer(a.version,b.version));}

function safeRelativeFile(value,label='catalog path'){
 if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\'))throw new Error(`Unsafe ${label}: ${String(value)}`);
 const parts=value.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))throw new Error(`Path traversal is not allowed in ${label}: ${value}`);
 return value;
}
function isHttps(value){
 try{return typeof value==='string'&&new URL(value).protocol==='https:';}catch{return false;}
}
function isExternalSource(source){return source.author!=='LyricForge'||!source.sourceUrl.startsWith(LYRICFORGE_SOURCE_PREFIX);}
function assertSourceDescriptor(source){
 if(!source||typeof source!=='object')throw new Error('External catalog items require source metadata');
 if(typeof source.provider!=='string'||!source.provider.trim())throw new Error('Catalog source provider is required');
 if(!isHttps(source.itemUrl))throw new Error('Catalog source itemUrl must use HTTPS');
 if(source.creator!==undefined&&(typeof source.creator!=='string'||!source.creator.trim()))throw new Error('Catalog source creator must not be blank');
 if(source.attribution!==undefined&&(typeof source.attribution!=='string'||!source.attribution.trim()))throw new Error('Catalog source attribution must not be blank');
 if(source.discoveredVia!==undefined&&(typeof source.discoveredVia!=='string'||!source.discoveredVia.trim()))throw new Error('Catalog source discoveredVia must not be blank');
}
function assertIdentity(source){
 if(!source||typeof source!=='object')throw new Error('Catalog source must be an object');
 if(source.schemaVersion!==1)throw new Error('Catalog source schemaVersion must be 1');
 if(!ASSET_TYPES.has(source.type))throw new Error(`Unsupported catalog asset type: ${String(source.type)}`);
 if(typeof source.id!=='string'||!/^[a-z0-9][a-z0-9._-]*$/i.test(source.id))throw new Error('Invalid catalog asset id');
 if(typeof source.version!=='string'||!SEMVER.test(source.version))throw new Error('Invalid catalog semantic version');
 if(typeof source.name!=='string'||!source.name.trim())throw new Error('Catalog name is required');
 if(typeof source.description!=='string'||!source.description.trim())throw new Error('Catalog description is required');
 if(typeof source.author!=='string'||!source.author.trim())throw new Error('Catalog author is required');
 if(typeof source.sourceUrl!=='string'||!source.sourceUrl.startsWith('https://'))throw new Error('Catalog sourceUrl must use HTTPS');
 if(typeof source.license!=='string'||!source.license.trim())throw new Error('Catalog license is required');
 if(!Array.isArray(source.tags))throw new Error('Catalog tags must be an array');
 if(typeof source.minAppVersion!=='string'||!SEMVER.test(source.minAppVersion))throw new Error('Catalog minAppVersion must be semantic version');
 if(source.maxAppVersion!==undefined&&(!SEMVER.test(source.maxAppVersion)||compareSemVer(source.maxAppVersion,source.minAppVersion)<0))throw new Error('Catalog maxAppVersion is invalid');
 if(!source.preview||!['image','video'].includes(source.preview.kind))throw new Error('Catalog preview metadata is required');
 if(source.preview.file!==undefined)safeRelativeFile(source.preview.file,'preview path');
 if(source.source!==undefined)assertSourceDescriptor(source.source);
 if(isExternalSource(source)&&!source.source)throw new Error('External catalog items require source metadata');
 if(/^CC-BY(?:-SA)?-/i.test(source.license)){
  assertSourceDescriptor(source.source);
  if(typeof source.source.creator!=='string'||!source.source.creator.trim())throw new Error('Attribution-bearing catalog items require a source creator');
  if(typeof source.source.attribution!=='string'||!source.source.attribution.trim())throw new Error('Attribution-bearing catalog items require source attribution');
 }
}
function assertTrustedRuntimeAndLicense(source){
 if(source.type==='font'){
  if(source.runtimeId)throw new Error('Fonts cannot declare a trusted runtime');
  if(!source.font||typeof source.font.family!=='string'||!source.font.family.trim())throw new Error('Font metadata is required');
  if(!REDISTRIBUTABLE_FONT_LICENSES.has(source.license)||typeof source.licenseUrl!=='string'||!source.licenseUrl.startsWith('https://'))throw new Error('Official catalog fonts require redistributable license metadata');
 }else if(typeof source.runtimeId!=='string'||!TRUSTED_CATALOG_RUNTIMES.has(source.runtimeId)){
  throw new Error(`Catalog asset requires a trusted runtime: ${String(source.runtimeId)}`);
 }
}
export function assertTrustedCatalogSource(source){assertIdentity(source);assertTrustedRuntimeAndLicense(source);return source;}

function normalizePayloadBytes(value,name){
 if(!ArrayBuffer.isView(value)||value.BYTES_PER_ELEMENT!==1)throw new Error(`Package payload ${name} is missing bytes`);
 return Uint8Array.from(value);
}

export function buildAssetPackage(source,payloads={}){
 assertTrustedCatalogSource(source);
 const names=Object.keys(payloads).sort();
 const files=[];
 const archiveEntries={};
 const normalizedPayloads={};
 for(const name of names){
  safeRelativeFile(name,'package payload path');
  if(name==='manifest.json')throw new Error('Package payload cannot replace manifest.json');
  const payload=payloads[name];
  if(!payload)throw new Error(`Package payload ${name} is missing bytes`);
  const bytes=normalizePayloadBytes(payload.bytes,name);
  if(!ALLOWED_CATALOG_MIME.has(payload.mime))throw new Error(`Unsupported payload MIME type: ${String(payload.mime)}`);
  normalizedPayloads[name]=bytes;
  files.push({path:name,mime:payload.mime,size:bytes.byteLength,sha256:sha256Hex(bytes)});
 }
 const embedded={schemaVersion:1,id:source.id,version:source.version,type:source.type,...(source.runtimeId?{runtimeId:source.runtimeId}:{}),...(source.preset?{preset:source.preset}:{}),...(source.font?{font:source.font}:{}),files};
 archiveEntries['manifest.json']=strToU8(stableJson(embedded));
 for(const name of names)archiveEntries[name]=normalizedPayloads[name];
 const bytes=zipSync(archiveEntries,{level:0,mtime:FIXED_ZIP_TIME});
 return {bytes,sha256:sha256Hex(bytes),embedded};
}

export function remoteManifestFromSource(source,built,relativeDir){
 assertTrustedCatalogSource(source);
 const previewFile=safeRelativeFile(source.preview.file,'preview path');
 const packageUrl=`${relativeDir}/asset.lyricforge-asset`;
 const previewUrl=`${relativeDir}/${previewFile}`;
 return {
  schemaVersion:1,id:source.id,version:source.version,type:source.type,name:source.name,description:source.description,author:source.author,sourceUrl:source.sourceUrl,...(source.source?{source:{...source.source}}:{}),license:source.license,...(source.licenseUrl?{licenseUrl:source.licenseUrl}:{}),tags:[...source.tags],minAppVersion:source.minAppVersion,...(source.maxAppVersion?{maxAppVersion:source.maxAppVersion}:{}),...(source.runtimeId?{runtimeId:source.runtimeId}:{}),...(source.preset?{preset:source.preset}:{}),preview:{kind:source.preview.kind,url:previewUrl},package:{url:packageUrl,size:built.bytes.byteLength,sha256:built.sha256},...(source.font?{font:source.font}:{}),...(source.changelog?{changelog:source.changelog}:{}),
 };
}

function parseJsonFile(filename){try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch(error){throw new Error(`Invalid JSON ${filename}: ${error instanceof Error?error.message:String(error)}`);}}
function resolveCatalogFile(root,relative){safeRelativeFile(relative);const absolute=path.resolve(root,relative);const normalizedRoot=`${path.resolve(root)}${path.sep}`;if(!absolute.startsWith(normalizedRoot))throw new Error(`Path traversal is not allowed: ${relative}`);return absolute;}

export function validateCatalogDirectory(root='public/catalog'){
 const indexPath=path.join(root,'index.json');
 if(!fs.existsSync(indexPath))throw new Error('Catalog index.json is missing');
 const index=parseJsonFile(indexPath);
 if(index.schemaVersion!==1||index.catalogId!=='official'||typeof index.generatedAt!=='string'||Number.isNaN(Date.parse(index.generatedAt))||!Array.isArray(index.items))throw new Error('Invalid catalog index');
 const seen=new Set();
 for(const item of index.items){
  assertIdentity({...item,preview:{...item.preview,file:item.preview?.url}});
  assertTrustedRuntimeAndLicense(item);
  const key=`${item.type}:${item.id}@${item.version}`;
  if(seen.has(key))throw new Error(`Duplicate catalog asset version: ${key}`);
  seen.add(key);
  const packagePath=resolveCatalogFile(root,item.package?.url);
  const previewPath=resolveCatalogFile(root,item.preview?.url);
  if(!fs.existsSync(previewPath))throw new Error(`Missing catalog preview: ${item.preview?.url}`);
  if(!fs.existsSync(packagePath))throw new Error(`Missing catalog package: ${item.package?.url}`);
  const bytes=new Uint8Array(fs.readFileSync(packagePath));
  if(bytes.byteLength!==item.package.size)throw new Error(`Catalog package size mismatch: ${key}`);
  if(sha256Hex(bytes)!==item.package.sha256)throw new Error(`Catalog package SHA-256 mismatch: ${key}`);
  let archive;
  try{archive=unzipSync(bytes);}catch{throw new Error(`Catalog package ZIP is invalid: ${key}`);}
  for(const archivePath of Object.keys(archive))safeRelativeFile(archivePath,'package archive path');
  if(!archive['manifest.json'])throw new Error(`Catalog package manifest is missing: ${key}`);
  const embedded=JSON.parse(strFromU8(archive['manifest.json']));
  if(embedded.schemaVersion!==1||embedded.id!==item.id||embedded.version!==item.version||embedded.type!==item.type)throw new Error(`Catalog embedded manifest identity mismatch: ${key}`);
  if(item.type==='font'){
   if(embedded.runtimeId)throw new Error(`Font package declares executable runtime: ${key}`);
  }else if(embedded.runtimeId!==item.runtimeId||!TRUSTED_CATALOG_RUNTIMES.has(embedded.runtimeId))throw new Error(`Catalog package has an untrusted runtime: ${key}`);
  const declared=new Map((embedded.files??[]).map(file=>[file.path,file]));
  for(const [filePath,file] of declared){
   safeRelativeFile(filePath,'declared payload path');
   if(!ALLOWED_CATALOG_MIME.has(file.mime))throw new Error(`Unsupported payload MIME type: ${file.mime}`);
   const data=archive[filePath];
   if(!data)throw new Error(`Catalog package is missing declared payload: ${filePath}`);
   if(data.byteLength!==file.size||sha256Hex(data)!==file.sha256)throw new Error(`Catalog payload integrity mismatch: ${filePath}`);
  }
  for(const archivePath of Object.keys(archive))if(archivePath!=='manifest.json'&&!declared.has(archivePath))throw new Error(`Catalog package contains undeclared payload: ${archivePath}`);
  if(item.type==='font'&&item.license==='OFL-1.1'&&!archive['OFL.txt'])throw new Error(`OFL font package is missing OFL.txt: ${key}`);
  const manifestPath=path.join(path.dirname(packagePath),'manifest.json');
  if(!fs.existsSync(manifestPath))throw new Error(`External catalog manifest is missing: ${key}`);
  const external=parseJsonFile(manifestPath);
  if(stableJson(external)!==stableJson(item))throw new Error(`External catalog manifest differs from index: ${key}`);
 }
 return index;
}
