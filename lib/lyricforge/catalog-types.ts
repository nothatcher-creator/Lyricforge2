import type {AssetParamValue,CreativeAssetType} from './creative-assets';

export const CATALOG_SCHEMA_VERSION=1 as const;
export const CATALOG_ID='official' as const;
export const CATALOG_APP_VERSION='0.1.0';
export const CATALOG_PACKAGE_MAX_BYTES=64*1024*1024;
export const CATALOG_MANIFEST_MAX_BYTES=256*1024;
export const CATALOG_PREVIEW_MAX_BYTES=8*1024*1024;

export type CatalogAssetType=CreativeAssetType;

export interface CatalogPackageRef{
 url:string;
 size:number;
 sha256:string;
}

export interface CatalogPreviewRef{
 kind:'image'|'video';
 url:string;
}

export interface CatalogFontDescriptor{
 family:string;
 style:'normal'|'italic';
 weight:number;
}

export interface CatalogAssetManifest{
 schemaVersion:1;
 id:string;
 version:string;
 type:CatalogAssetType;
 name:string;
 description:string;
 author:string;
 sourceUrl:string;
 license:string;
 licenseUrl?:string;
 tags:string[];
 minAppVersion:string;
 maxAppVersion?:string;
 runtimeId?:string;
 preset?:Record<string,AssetParamValue>;
 preview:CatalogPreviewRef;
 package:CatalogPackageRef;
 font?:CatalogFontDescriptor;
 changelog?:string;
}

export interface CatalogIndex{
 schemaVersion:1;
 catalogId:'official';
 generatedAt:string;
 items:CatalogAssetManifest[];
}

export interface EmbeddedCatalogFile{
 path:string;
 mime:string;
 size:number;
 sha256:string;
}

export interface EmbeddedAssetManifest{
 schemaVersion:1;
 id:string;
 version:string;
 type:CatalogAssetType;
 runtimeId?:string;
 preset?:Record<string,AssetParamValue>;
 font?:CatalogFontDescriptor;
 files:EmbeddedCatalogFile[];
}

export interface CatalogAssetKey{
 id:string;
 type:CatalogAssetType;
}

export interface InstalledAssetVersion extends CatalogAssetKey{
 version:string;
 catalogId:string;
 manifest:CatalogAssetManifest;
 installedAt:number;
 packageCacheKey:string;
}

export const catalogAssetKey=(type:CatalogAssetType,id:string)=>`${type}:${id}`;
export const catalogVersionKey=(type:CatalogAssetType,id:string,version:string)=>`${catalogAssetKey(type,id)}@${version}`;
