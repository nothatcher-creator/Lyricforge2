export interface CatalogSourceDescriptor{provider:string;itemUrl:string;creator?:string;attribution?:string;discoveredVia?:string;}
export interface CatalogElementDescriptor{file:string;mime:'image/svg+xml'|'image/png';width?:number;height?:number;defaultDurationMs?:number;defaultFit?:'contain'|'cover';}
export interface CatalogSource{schemaVersion:number;id:string;version:string;type:'font'|'effect'|'transition'|'text-animation'|'element';name:string;description:string;author:string;sourceUrl:string;source?:CatalogSourceDescriptor;license:string;licenseUrl?:string;tags:readonly string[];minAppVersion:string;maxAppVersion?:string;runtimeId?:string;preset?:Record<string,string|number|boolean>;preview:{kind:'image'|'video';file:string};font?:{family:string;style:'normal'|'italic';weight:number};element?:CatalogElementDescriptor;changelog?:string;publishedAt?:string;files?:readonly unknown[];}
export interface CatalogPayload{mime:string;bytes:Uint8Array;}
export interface EmbeddedCatalogManifest{schemaVersion:1;id:string;version:string;type:string;runtimeId?:string;preset?:Record<string,string|number|boolean>;font?:{family:string;style:'normal'|'italic';weight:number};element?:CatalogElementDescriptor;files:Array<{path:string;mime:string;size:number;sha256:string}>;}
export interface BuiltCatalogPackage{bytes:Uint8Array;sha256:string;embedded:EmbeddedCatalogManifest;}
export function stableJson(value:unknown):string;
export function sha256Hex(bytes:Uint8Array):string;
export function gitBlobSha1(bytes:Uint8Array):string;
export function sortCatalogItems<T extends {type:string;id:string;version:string}>(items:readonly T[]):T[];
export function assertTrustedCatalogSource<T extends CatalogSource>(source:T):T;
export function buildAssetPackage(source:CatalogSource,payloads?:Record<string,CatalogPayload>):BuiltCatalogPackage;
export function remoteManifestFromSource(source:CatalogSource,built:BuiltCatalogPackage,relativeDir:string):Record<string,unknown>;
export function validateCatalogDirectory(root?:string):Record<string,unknown>;
