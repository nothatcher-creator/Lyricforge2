import {afterEach,describe,expect,it} from 'vitest';
import type {CatalogAssetManifest} from '../catalog-types';
import {definitionFromInstalledManifest} from '../catalog-creative';
import {creativeRegistry} from '../creative-registry';
import {EditorStore} from '../store';

function effectManifest(preset:Record<string,string|number|boolean>={}):CatalogAssetManifest{
 return {
  schemaVersion:1,
  id:'catalog.effect.neon-pulse',
  version:'1.2.0',
  type:'effect',
  name:'Neon Pulse',
  description:'A catalog glow preset',
  author:'LyricForge',
  sourceUrl:'https://github.com/nothatcher-creator/Lyricforge2',
  license:'CC0-1.0',
  tags:['neon'],
  minAppVersion:'0.1.0',
  runtimeId:'effect.glow',
  preset,
  preview:{kind:'image',url:'preview.svg'},
  package:{url:'neon-pulse.lyricforge-asset',size:10,sha256:'a'.repeat(64)},
 };
}

afterEach(()=>creativeRegistry.replaceInstalled([]));

describe('installed creative catalog presets',()=>{
 it('creates a new asset id while preserving the trusted runtime schema',()=>{
  const trusted=creativeRegistry.definitions.find(definition=>definition.runtime==='effect.glow')!;
  const installed=definitionFromInstalledManifest(effectManifest({radius:30,intensity:.9}),trusted);
  expect(installed.id).toBe('catalog.effect.neon-pulse');
  expect(installed.version).toBe('1.2.0');
  expect(installed.name).toBe('Neon Pulse');
  expect(installed.runtime).toBe('effect.glow');
  expect(installed.params.radius.default).toBe(30);
  expect(installed.params.radius.min).toBe(trusted.params.radius.min);
  expect(installed.targets).toEqual(trusted.targets);
  expect(installed.quality).toEqual(trusted.quality);
 });

 it('clamps preset defaults and cannot add unknown parameters or alter schema bounds',()=>{
  const trusted=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  const installed=definitionFromInstalledManifest(effectManifest({radius:999,intensity:-5,unknown:42}),trusted);
  expect(installed.params.radius.default).toBe(80);
  expect(installed.params.intensity.default).toBe(0);
  expect(installed.params).not.toHaveProperty('unknown');
  expect(installed.params.radius.max).toBe(80);
 });

 it('rejects a manifest whose runtime does not match the supplied trusted definition',()=>{
  const trusted=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  expect(()=>definitionFromInstalledManifest({...effectManifest(),runtimeId:'effect.blur'},trusted)).toThrow(/runtime/i);
 });

 it('keeps built-ins immutable while replacing installed definitions',()=>{
  const trusted=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  const installed=definitionFromInstalledManifest(effectManifest({radius:32}),trusted);
  creativeRegistry.replaceInstalled([installed]);
  expect(creativeRegistry.resolve('effect',installed.id,installed.version)?.params.radius.default).toBe(32);
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')?.params.radius.default).toBe(18);
  creativeRegistry.replaceInstalled([]);
  expect(creativeRegistry.resolve('effect',installed.id,installed.version)).toBeNull();
  expect(creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')).not.toBeNull();
 });

 it('lets the existing store create an effect instance from an installed exact version',()=>{
  const trusted=creativeRegistry.resolve('effect','builtin.effect.glow','1.0.0')!;
  const installed=definitionFromInstalledManifest(effectManifest({radius:44,intensity:.7}),trusted);
  creativeRegistry.replaceInstalled([installed]);
  const editor=new EditorStore();
  const effect=editor.addMasterEffect(installed.id,installed.version);
  expect(effect?.assetId).toBe(installed.id);
  expect(effect?.version).toBe('1.2.0');
  expect(effect?.params.radius).toBe(44);
  expect(effect?.params.intensity).toBe(.7);
 });
});
