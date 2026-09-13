import {strFromU8,unzip} from 'fflate';
import type {CatalogAssetManifest,EmbeddedAssetManifest} from './catalog-types';
import {CATALOG_MANIFEST_MAX_BYTES,CATALOG_PACKAGE_MAX_BYTES} from './catalog-types';
import {validateEmbeddedAssetManifest} from './catalog-validation';

export interface ValidatedCatalogPackage{
 manifest:EmbeddedAssetManifest;
 files:Map<string,Uint8Array>;
 bytes:Uint8Array;
}

export async function sha256Hex(data:Uint8Array|ArrayBuffer):Promise<string>{
 const source=data instanceof Uint8Array?data:new Uint8Array(data);
 const bytes=new Uint8Array(source.byteLength);
 bytes.set(source);
 const digest=await crypto.subtle.digest('SHA-256',bytes.buffer);
 return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

function assertSafePackagePath(path:string){
 if(!path||path.includes('\\')||path.startsWith('/')||/^[A-Za-z]:/.test(path))throw new Error(`Unsafe package path: ${path}`);
 const parts=path.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))throw new Error(`Path traversal or unsafe package path: ${path}`);
}

async function unzipBounded(bytes:Uint8Array):Promise<Record<string,Uint8Array>>{
 return new Promise((resolve,reject)=>{
  let total=0;
  let validationError:Error|undefined;
  const seen=new Set<string>();
  unzip(bytes,{
   filter(file){
    if(validationError)return false;
    try{
     assertSafePackagePath(file.name);
     if(seen.has(file.name))throw new Error(`Duplicate package path: ${file.name}`);
     seen.add(file.name);
     total+=file.originalSize;
     if(total>CATALOG_PACKAGE_MAX_BYTES)throw new Error('Catalog package uncompressed payload exceeds the 64 MiB limit');
     return true;
    }catch(error){validationError=error instanceof Error?error:new Error(String(error));return false;}
   },
  },(error,files)=>{
   if(validationError){reject(validationError);return;}
   if(error){reject(new Error(`Corrupt catalog ZIP: ${error.message}`));return;}
   resolve(files);
  });
 });
}

function assertIdentity(remote:CatalogAssetManifest,embedded:EmbeddedAssetManifest){
 if(remote.id!==embedded.id||remote.version!==embedded.version||remote.type!==embedded.type){
  throw new Error(`Catalog package identity mismatch: expected ${remote.type}:${remote.id}@${remote.version}, received ${embedded.type}:${embedded.id}@${embedded.version}`);
 }
 if(remote.runtimeId!==embedded.runtimeId)throw new Error('Catalog package runtime identity does not match the remote manifest');
}

export async function validateCatalogPackage(input:Uint8Array|ArrayBuffer,remote:CatalogAssetManifest):Promise<ValidatedCatalogPackage>{
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength>CATALOG_PACKAGE_MAX_BYTES)throw new Error('Catalog package exceeds the 64 MiB limit');
 if(bytes.byteLength!==remote.package.size)throw new Error(`Catalog package size mismatch: expected ${remote.package.size}, received ${bytes.byteLength}`);
 const packageHash=await sha256Hex(bytes);
 if(packageHash.toLowerCase()!==remote.package.sha256.toLowerCase())throw new Error('Catalog package SHA-256 integrity check failed');

 const archive=await unzipBounded(bytes);
 const manifestBytes=archive['manifest.json'];
 if(!manifestBytes)throw new Error('Catalog package is missing root manifest.json');
 if(manifestBytes.byteLength>CATALOG_MANIFEST_MAX_BYTES)throw new Error('Catalog package manifest exceeds the 256 KiB limit');
 let rawManifest:unknown;
 try{rawManifest=JSON.parse(strFromU8(manifestBytes));}
 catch{throw new Error('Catalog package manifest.json is not valid JSON');}
 const manifest=validateEmbeddedAssetManifest(rawManifest);
 assertIdentity(remote,manifest);

 const declared=new Map(manifest.files.map(file=>[file.path,file]));
 if(declared.size!==manifest.files.length)throw new Error('Catalog package manifest contains duplicate declared file paths');
 for(const path of declared.keys())assertSafePackagePath(path);

 const files=new Map<string,Uint8Array>();
 for(const [path,data] of Object.entries(archive)){
  if(path==='manifest.json')continue;
  const declaration=declared.get(path);
  if(!declaration)throw new Error(`Catalog package contains undeclared file: ${path}`);
  if(data.byteLength!==declaration.size)throw new Error(`Catalog package file size integrity mismatch: ${path}`);
  const actualHash=await sha256Hex(data);
  if(actualHash.toLowerCase()!==declaration.sha256.toLowerCase())throw new Error(`Catalog package file SHA-256 integrity mismatch: ${path}`);
  files.set(path,data);
 }
 for(const path of declared.keys())if(!files.has(path))throw new Error(`Catalog package is missing declared file: ${path}`);
 return {manifest,files,bytes};
}
