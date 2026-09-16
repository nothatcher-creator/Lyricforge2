import {z} from 'zod';
import {CREATIVE_ASSET_TYPES} from './creative-assets';
import type {CatalogAssetManifest,CatalogIndex,EmbeddedAssetManifest} from './catalog-types';
import {CATALOG_MANIFEST_MAX_BYTES,CATALOG_PACKAGE_MAX_BYTES,CATALOG_PREVIEW_MAX_BYTES} from './catalog-types';
import {parseSemVer} from './catalog-version';

const sha256=z.string().regex(/^[0-9a-f]{64}$/i,'Invalid SHA-256');
const assetType=z.enum(CREATIVE_ASSET_TYPES);
const paramValue=z.union([z.string().max(1000),z.number().finite(),z.boolean()]);
const semver=z.string().refine(value=>{try{parseSemVer(value);return true;}catch{return false;}},'Invalid semantic version');
const safeRelativeOrHttpsUrl=z.string().min(1).max(2048).refine(value=>{
 if(value.startsWith('/')||value.startsWith('./')||value.startsWith('../'))return true;
 try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:';}catch{return !value.includes('://');}
},'Invalid URL');
const httpsUrl=z.string().url().refine(value=>new URL(value).protocol==='https:','URL must use HTTPS');
const EXECUTABLE_ELEMENT_PATH=/\.(?:[cm]?js|html?|xhtml)$/i;

function isSafeElementPath(value:string){
 if(!value||value.startsWith('/')||value.includes('\\')||EXECUTABLE_ELEMENT_PATH.test(value))return false;
 const parts=value.split('/');
 return !parts.some(part=>!part||part==='.'||part==='..');
}

const packageRef=z.object({
 url:safeRelativeOrHttpsUrl,
 size:z.number().int().min(1).max(CATALOG_PACKAGE_MAX_BYTES),
 sha256,
}).strict();

const previewRef=z.object({
 kind:z.enum(['image','video']),
 url:safeRelativeOrHttpsUrl,
}).strict();

const fontDescriptor=z.object({
 family:z.string().min(1).max(160),
 style:z.enum(['normal','italic']),
 weight:z.number().int().min(100).max(900),
}).strict();

const elementDescriptor=z.object({
 file:z.string().min(1).max(512).refine(isSafeElementPath,'Element file path must be a safe non-executable asset'),
 mime:z.enum(['image/svg+xml','image/png']),
 width:z.number().int().min(1).max(16384).optional(),
 height:z.number().int().min(1).max(16384).optional(),
 defaultDurationMs:z.number().int().min(1).max(86400000).optional(),
 defaultFit:z.enum(['contain','cover']).optional(),
}).strict().superRefine((value,ctx)=>{
 const expected=value.mime==='image/svg+xml'?'.svg':'.png';
 if(!value.file.toLowerCase().endsWith(expected))ctx.addIssue({code:z.ZodIssueCode.custom,path:['file'],message:`Element ${value.mime} payload must use ${expected}`});
});

const sourceDescriptor=z.object({
 provider:z.string().trim().min(1).max(160),
 itemUrl:httpsUrl,
 creator:z.string().trim().min(1).max(300).optional(),
 attribution:z.string().trim().min(1).max(2000).optional(),
 discoveredVia:z.string().trim().min(1).max(160).optional(),
}).strict();

const catalogAssetManifestSchema=z.object({
 schemaVersion:z.literal(1),
 id:z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._-]*$/,'Invalid catalog asset id'),
 version:semver,
 type:assetType,
 name:z.string().min(1).max(200),
 description:z.string().min(1).max(4000),
 author:z.string().min(1).max(200),
 sourceUrl:httpsUrl,
 source:sourceDescriptor.optional(),
 license:z.string().min(1).max(160),
 licenseUrl:httpsUrl.optional(),
 tags:z.array(z.string().min(1).max(80)).max(50),
 minAppVersion:semver,
 maxAppVersion:semver.optional(),
 runtimeId:z.string().min(1).max(160).optional(),
 preset:z.record(paramValue).optional(),
 preview:previewRef,
 package:packageRef,
 font:fontDescriptor.optional(),
 element:elementDescriptor.optional(),
 changelog:z.string().max(8000).optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.type==='font'){
  if(!value.font)ctx.addIssue({code:z.ZodIssueCode.custom,path:['font'],message:'Font metadata is required'});
  if(value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Fonts cannot declare a runtime'});
  if(value.element)ctx.addIssue({code:z.ZodIssueCode.custom,path:['element'],message:'Fonts cannot declare element metadata'});
 }else if(value.type==='element'){
  if(!value.element)ctx.addIssue({code:z.ZodIssueCode.custom,path:['element'],message:'Element metadata is required'});
  if(value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Elements cannot declare a runtime'});
  if(value.font)ctx.addIssue({code:z.ZodIssueCode.custom,path:['font'],message:'Elements cannot declare font metadata'});
 }else{
  if(!value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Creative assets require a trusted runtime id'});
  if(value.element)ctx.addIssue({code:z.ZodIssueCode.custom,path:['element'],message:'Only element assets may declare element metadata'});
 }
 if(value.maxAppVersion){
  try{if(parseSemVer(value.maxAppVersion)&&parseSemVer(value.minAppVersion)){
   const max=parseSemVer(value.maxAppVersion),min=parseSemVer(value.minAppVersion);
   const maxTuple=[max.major,max.minor,max.patch],minTuple=[min.major,min.minor,min.patch];
   if(maxTuple[0]<minTuple[0]||(maxTuple[0]===minTuple[0]&&maxTuple[1]<minTuple[1])||(maxTuple[0]===minTuple[0]&&maxTuple[1]===minTuple[1]&&maxTuple[2]<minTuple[2]))ctx.addIssue({code:z.ZodIssueCode.custom,path:['maxAppVersion'],message:'Maximum app version must not precede minimum'});
  }}catch{/* semver field validation reports the malformed value */}
 }
});

const embeddedFileSchema=z.object({
 path:z.string().min(1).max(512),
 mime:z.string().min(1).max(160),
 size:z.number().int().min(0).max(CATALOG_PACKAGE_MAX_BYTES),
 sha256,
}).strict();

const embeddedSchema=z.object({
 schemaVersion:z.literal(1),
 id:z.string().min(1).max(160),
 version:semver,
 type:assetType,
 runtimeId:z.string().min(1).max(160).optional(),
 preset:z.record(paramValue).optional(),
 font:fontDescriptor.optional(),
 element:elementDescriptor.optional(),
 files:z.array(embeddedFileSchema).max(256),
}).strict().superRefine((value,ctx)=>{
 if(value.type==='font'){
  if(!value.font)ctx.addIssue({code:z.ZodIssueCode.custom,path:['font'],message:'Font metadata is required'});
  if(value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Fonts cannot declare a runtime'});
 }else if(value.type==='element'){
  if(!value.element)ctx.addIssue({code:z.ZodIssueCode.custom,path:['element'],message:'Element metadata is required'});
  if(value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Elements cannot declare a runtime'});
  if(value.font)ctx.addIssue({code:z.ZodIssueCode.custom,path:['font'],message:'Elements cannot declare font metadata'});
  if(value.element){
   const matches=value.files.filter(file=>file.path===value.element!.file);
   if(matches.length!==1)ctx.addIssue({code:z.ZodIssueCode.custom,path:['files'],message:'Element package must contain exactly one declared element payload file'});
   else if(matches[0].mime!==value.element.mime)ctx.addIssue({code:z.ZodIssueCode.custom,path:['files'],message:'Element payload MIME must match element metadata'});
  }
  for(const file of value.files){
   if(EXECUTABLE_ELEMENT_PATH.test(file.path))ctx.addIssue({code:z.ZodIssueCode.custom,path:['files'],message:'Element packages cannot contain executable-looking file paths'});
  }
 }else{
  if(!value.runtimeId)ctx.addIssue({code:z.ZodIssueCode.custom,path:['runtimeId'],message:'Creative assets require a trusted runtime id'});
  if(value.element)ctx.addIssue({code:z.ZodIssueCode.custom,path:['element'],message:'Only element assets may declare element metadata'});
 }
});

const ALLOWED_EMBEDDED_MIME=new Set([
 'application/json','font/ttf','font/woff2','image/png','image/jpeg','image/webp','image/svg+xml','video/mp4','video/webm','text/plain'
]);

function parseOrThrow<T>(schema:z.ZodType<T>,value:unknown,label:string):T{
 const parsed=schema.safeParse(value);
 if(!parsed.success){const issue=parsed.error.issues[0];throw new Error(`${label}: ${issue.path.join('.')} ${issue.message}`.trim());}
 return parsed.data;
}

export function validateCatalogAssetManifest(value:unknown):CatalogAssetManifest{
 return parseOrThrow(catalogAssetManifestSchema,value,'Invalid catalog asset manifest') as CatalogAssetManifest;
}

export function validateEmbeddedAssetManifest(value:unknown):EmbeddedAssetManifest{
 const manifest=parseOrThrow(embeddedSchema,value,'Invalid embedded asset manifest') as EmbeddedAssetManifest;
 for(const file of manifest.files){
  if(!ALLOWED_EMBEDDED_MIME.has(file.mime))throw new Error(`Unsupported payload MIME type: ${file.mime}`);
 }
 const jsonBytes=new TextEncoder().encode(JSON.stringify(value)).byteLength;
 if(jsonBytes>CATALOG_MANIFEST_MAX_BYTES)throw new Error('Embedded asset manifest exceeds the 256 KiB limit');
 return manifest;
}

export function validateCatalogIndex(value:unknown):CatalogIndex{
 const schema=z.object({
  schemaVersion:z.literal(1),
  catalogId:z.literal('official'),
  generatedAt:z.string().datetime(),
  items:z.array(catalogAssetManifestSchema).max(10000),
 }).strict();
 const index=parseOrThrow(schema,value,'Invalid catalog index') as CatalogIndex;
 const seen=new Set<string>();
 for(const item of index.items){
  const key=`${item.type}:${item.id}@${item.version}`;
  if(seen.has(key))throw new Error(`Duplicate catalog asset version: ${key}`);
  seen.add(key);
 }
 return index;
}

export const CATALOG_ALLOWED_PAYLOAD_MIME=ALLOWED_EMBEDDED_MIME;
export const CATALOG_MAX_PREVIEW_BYTES=CATALOG_PREVIEW_MAX_BYTES;
