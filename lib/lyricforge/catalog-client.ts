'use client';
import {CatalogInstaller} from './catalog-installer';
import {CatalogService} from './catalog-service';
import {getBrowserCatalogStorage} from './catalog-storage';
import {CATALOG_APP_VERSION} from './catalog-types';
import {isTrustedRuntime} from './creative-registry';
import {publicPath} from './public-path';

function catalogAssetUrl(value:string){
 if(/^https?:\/\//i.test(value))return value;
 const clean=value.replace(/^\.\//,'').replace(/^\//,'');
 return publicPath(`/catalog/${clean}`);
}

let sharedClient:{service:CatalogService;installer:CatalogInstaller}|undefined;
export function getBrowserCatalogClient(){
 if(sharedClient)return sharedClient;
 const storage=getBrowserCatalogStorage();
 const service=new CatalogService({storage,appVersion:CATALOG_APP_VERSION});
 const installer=new CatalogInstaller({
  storage,
  appVersion:CATALOG_APP_VERSION,
  isTrustedRuntime,
  fetchBytes:async url=>{
   const response=await fetch(catalogAssetUrl(url),{cache:'no-cache'});
   if(!response.ok)throw new Error(`Catalog asset download failed with HTTP ${response.status}`);
   return new Uint8Array(await response.arrayBuffer());
  },
 });
 sharedClient={service,installer};
 return sharedClient;
}
