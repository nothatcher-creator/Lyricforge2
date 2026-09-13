import {catalogFontFamilyName} from './creative-assets';
import {validateCatalogPackage} from './catalog-package';
import type {InstalledAssetVersion} from './catalog-types';

export interface LoadedCatalogFont{
 id:string;
 version:string;
 name:string;
 family:string;
 style:'normal'|'italic';
 weight:number;
}

interface LoadedCatalogFontInternal{
 entry:LoadedCatalogFont;
 face:FontFace;
}

const loaded=new Map<string,LoadedCatalogFontInternal>();
const listeners=new Set<()=>void>();
let snapshot:readonly LoadedCatalogFont[]=[];

const key=(id:string,version:string)=>`${id}@${version}`;
const cloneBytes=(bytes:Uint8Array)=>{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy;};

function emit(){
 snapshot=[...loaded.values()].map(value=>value.entry);
 listeners.forEach(listener=>listener());
}

export function catalogFontFamily(id:string,version:string,displayFamily:string){
 return catalogFontFamilyName(id,version,displayFamily);
}

export const subscribeCatalogFonts=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const getCatalogFontsSnapshot=()=>snapshot;

export async function loadInstalledCatalogFont(record:InstalledAssetVersion,packageBytes:Uint8Array|ArrayBuffer):Promise<LoadedCatalogFont>{
 if(record.type!=='font'||record.manifest.type!=='font'||!record.manifest.font)throw new Error('Catalog font loader requires a font asset manifest');
 const existing=loaded.get(key(record.id,record.version));
 if(existing)return existing.entry;
 if(typeof FontFace==='undefined'||typeof document==='undefined'||!document.fonts)throw new Error('Catalog fonts require browser FontFace support');

 const validated=await validateCatalogPackage(packageBytes,record.manifest);
 const fontFiles=validated.manifest.files.filter(file=>file.mime==='font/ttf'||file.mime==='font/woff2');
 if(fontFiles.length!==1)throw new Error('Catalog font packages must contain exactly one supported font payload');
 const file=fontFiles[0];
 const payload=validated.files.get(file.path);
 if(!payload)throw new Error(`Catalog font payload is missing: ${file.path}`);

 const family=catalogFontFamily(record.id,record.version,record.manifest.font.family);
 const face=new FontFace(family,cloneBytes(payload).buffer,{
  style:record.manifest.font.style,
  weight:String(record.manifest.font.weight),
 });
 await face.load();
 document.fonts.add(face);
 const entry:LoadedCatalogFont={
  id:record.id,
  version:record.version,
  name:record.manifest.name,
  family,
  style:record.manifest.font.style,
  weight:record.manifest.font.weight,
 };
 loaded.set(key(record.id,record.version),{entry,face});
 emit();
 return entry;
}

export function unloadCatalogFont(id:string,version:string):boolean{
 const current=loaded.get(key(id,version));
 if(!current)return false;
 try{document.fonts.delete(current.face);}catch{/* font may already have been removed with its document */}
 loaded.delete(key(id,version));
 emit();
 return true;
}

export function clearCatalogFonts(){
 if(!loaded.size)return;
 for(const current of loaded.values()){
  try{document.fonts.delete(current.face);}catch{/* document may already be gone */}
 }
 loaded.clear();
 emit();
}
