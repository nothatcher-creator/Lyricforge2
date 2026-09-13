'use client';
import type {CatalogBrowseItem} from '@/lib/lyricforge/catalog-service';
import {publicPath} from '@/lib/lyricforge/public-path';

function catalogUrl(value:string){
 if(/^https?:\/\//i.test(value))return value;
 const clean=value.replace(/^\.\//,'').replace(/^\//,'');
 return publicPath(`/catalog/${clean}`);
}

export default function CatalogPreview({item}: {item:CatalogBrowseItem}){
 const preview=item.manifest?.preview;
 if(!preview){
  return <div className="catalog-preview catalog-preview-placeholder" aria-hidden="true"><span>{item.name.slice(0,2).toUpperCase()}</span></div>;
 }
 const src=catalogUrl(preview.url);
 if(preview.kind==='video'){
  return <video className="catalog-preview" src={src} muted playsInline loop preload="metadata" aria-label={`${item.name} preview`}/>;
 }
 return <img className="catalog-preview" src={src} alt={`${item.name} preview`} loading="lazy" decoding="async"/>;
}
