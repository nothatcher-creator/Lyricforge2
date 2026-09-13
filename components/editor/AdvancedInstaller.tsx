'use client';
import {useState} from 'react';
import {strFromU8,unzipSync} from 'fflate';
import {sha256Hex} from '@/lib/lyricforge/catalog-package';
import {CATALOG_APP_VERSION,CATALOG_PACKAGE_MAX_BYTES,type CatalogAssetManifest} from '@/lib/lyricforge/catalog-types';
import {validateCatalogAssetManifest,validateEmbeddedAssetManifest} from '@/lib/lyricforge/catalog-validation';

export interface AdvancedCatalogInstaller{
 install:(manifest:CatalogAssetManifest)=>Promise<unknown>;
 installBytes:(manifest:CatalogAssetManifest,bytes:Uint8Array|ArrayBuffer,options?:{makeCurrent?:boolean})=>Promise<unknown>;
}

export interface AdvancedInstallerProps{
 installer:AdvancedCatalogInstaller;
 fetchManifest?:(url:string)=>Promise<unknown>;
 fetcher?:typeof fetch;
 onInstalled?:(manifest:CatalogAssetManifest)=>Promise<void>|void;
}

const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','::1']);

export function validateManualManifestUrl(value:string):URL{
 let url:URL;
 try{url=new URL(value.trim());}catch{throw new Error('Enter a valid HTTPS manifest URL.');}
 if(url.username||url.password)throw new Error('Manifest URLs with embedded credentials are not supported.');
 if(url.protocol==='https:')return url;
 if(url.protocol==='http:'&&LOCAL_HOSTS.has(url.hostname))return url;
 throw new Error('Direct manifest URLs must use HTTPS. HTTP is allowed only for localhost development.');
}

function absolutizeManifestUrls(manifest:CatalogAssetManifest,baseUrl:string):CatalogAssetManifest{
 const absolute=(value:string)=>{try{return new URL(value,baseUrl).href;}catch{return value;}};
 return validateCatalogAssetManifest({
  ...manifest,
  preview:{...manifest.preview,url:absolute(manifest.preview.url)},
  package:{...manifest.package,url:absolute(manifest.package.url)},
 });
}

async function fetchDirectManifest(url:string,fetcher:typeof fetch):Promise<CatalogAssetManifest>{
 const safe=validateManualManifestUrl(url);
 const response=await fetcher(safe.href,{cache:'no-store'});
 if(!response.ok)throw new Error(`Manifest request failed with HTTP ${response.status}.`);
 const contentType=(response.headers.get('content-type')??'').toLowerCase();
 if(contentType.includes('text/html'))throw new Error('This URL returned HTML. Use a direct JSON LyricForge asset manifest URL; webpages are not scraped.');
 let raw:unknown;
 try{raw=await response.json();}catch{throw new Error('The direct manifest URL did not return valid JSON.');}
 return absolutizeManifestUrls(validateCatalogAssetManifest(raw),safe.href);
}

function friendlyManualName(id:string){
 const slug=id.split('.').at(-1)??id;
 return slug.split(/[-_]+/).filter(Boolean).map(part=>part[0]?.toUpperCase()+part.slice(1)).join(' ')||id;
}

async function manifestFromLocalPackage(file:File):Promise<{manifest:CatalogAssetManifest;bytes:Uint8Array}>{
 if(!file.name.toLowerCase().endsWith('.lyricforge-asset'))throw new Error('Choose a .lyricforge-asset file.');
 if(file.size<1||file.size>CATALOG_PACKAGE_MAX_BYTES)throw new Error('The LyricForge asset package is empty or exceeds the 64 MiB limit.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 let archive:Record<string,Uint8Array>;
 try{archive=unzipSync(bytes);}catch{throw new Error('The selected LyricForge asset package is not a valid ZIP archive.');}
 const embeddedBytes=archive['manifest.json'];
 if(!embeddedBytes)throw new Error('The selected package is missing manifest.json.');
 let raw:unknown;
 try{raw=JSON.parse(strFromU8(embeddedBytes));}catch{throw new Error('The selected package manifest is not valid JSON.');}
 const embedded=validateEmbeddedAssetManifest(raw);
 const manifest:CatalogAssetManifest=validateCatalogAssetManifest({
  schemaVersion:1,
  id:embedded.id,
  version:embedded.version,
  type:embedded.type,
  name:embedded.font?.family??friendlyManualName(embedded.id),
  description:'Manually installed LyricForge asset package',
  author:'User supplied',
  sourceUrl:'https://lyricforge.local/manual',
  license:'User supplied / unknown',
  tags:['manual'],
  minAppVersion:CATALOG_APP_VERSION,
  ...(embedded.runtimeId?{runtimeId:embedded.runtimeId}:{}),
  ...(embedded.preset?{preset:embedded.preset}:{}),
  ...(embedded.font?{font:embedded.font}:{}),
  preview:{kind:'image',url:'manual-preview.svg'},
  package:{url:`manual/${embedded.type}/${embedded.id}/${embedded.version}.lyricforge-asset`,size:bytes.byteLength,sha256:await sha256Hex(bytes)},
 });
 return {manifest,bytes};
}

export default function AdvancedInstaller({installer,fetchManifest,fetcher=fetch,onInstalled}:AdvancedInstallerProps){
 const [url,setUrl]=useState('');
 const [reviewed,setReviewed]=useState<CatalogAssetManifest>();
 const [file,setFile]=useState<File>();
 const [busy,setBusy]=useState<'review'|'url-install'|'file-install'|null>(null);
 const [error,setError]=useState<string>();
 const [message,setMessage]=useState<string>();

 const review=async()=>{
  setBusy('review');setError(undefined);setMessage(undefined);setReviewed(undefined);
  try{
   const safe=validateManualManifestUrl(url);
   const raw=fetchManifest?await fetchManifest(safe.href):await fetchDirectManifest(safe.href,fetcher);
   const manifest=fetchManifest?validateCatalogAssetManifest(raw):raw as CatalogAssetManifest;
   setReviewed(manifest);
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(null);}
 };
 const installReviewed=async()=>{
  if(!reviewed)return;
  setBusy('url-install');setError(undefined);setMessage(undefined);
  try{await installer.install(reviewed);await onInstalled?.(reviewed);setMessage(`${reviewed.name} installed.`);}
  catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(null);}
 };
 const installFile=async()=>{
  if(!file)return;
  setBusy('file-install');setError(undefined);setMessage(undefined);
  try{const local=await manifestFromLocalPackage(file);await installer.installBytes(local.manifest,local.bytes);await onInstalled?.(local.manifest);setMessage(`${local.manifest.name} installed.`);}
  catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  finally{setBusy(null);}
 };

 return <section className="advanced-installer" aria-label="Advanced asset installer">
  <h3>Advanced install</h3>
  <p className="hint">Install a direct LyricForge JSON manifest or a local declarative .lyricforge-asset package. Downloaded JavaScript is never executed.</p>
  <label className="advanced-installer-field"><span>Direct manifest URL</span><input aria-label="Direct manifest URL" type="url" value={url} onChange={event=>{setUrl(event.target.value);setReviewed(undefined);}} placeholder="https://example.com/my-effect.json"/></label>
  <button type="button" className="soft-button" disabled={!url.trim()||!!busy} onClick={review}>{busy==='review'?'Reviewing…':'Review manifest'}</button>
  {reviewed&&<article className="advanced-installer-review">
   <strong>{reviewed.name}</strong><span>{reviewed.author}</span><span>{reviewed.license}</span><span>{reviewed.type} · {reviewed.version}</span>{reviewed.runtimeId&&<code>{reviewed.runtimeId}</code>}
   <button type="button" className="soft-button" disabled={!!busy} aria-label={`Install ${reviewed.name}`} onClick={installReviewed}>{busy==='url-install'?'Installing…':`Install ${reviewed.name}`}</button>
  </article>}
  <div className="advanced-installer-divider" aria-hidden="true">or</div>
  <label className="advanced-installer-field"><span>LyricForge asset file</span><input aria-label="LyricForge asset file" type="file" accept=".lyricforge-asset,application/zip" onChange={event=>setFile(event.target.files?.[0])}/></label>
  <button type="button" className="soft-button" disabled={!file||!!busy} onClick={installFile}>{busy==='file-install'?'Installing…':'Install selected file'}</button>
  {error&&<p role="alert" className="catalog-error">{error}</p>}
  {message&&<p role="status" className="catalog-status">{message}</p>}
 </section>;
}
