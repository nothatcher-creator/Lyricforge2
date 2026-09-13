export const CREATIVE_ASSET_TYPES = ["font", "effect", "transition", "text-animation"] as const;
export type CreativeAssetType = (typeof CREATIVE_ASSET_TYPES)[number];
export type AnimationRole = "intro" | "loop" | "outro";
export type AssetParamValue = string | number | boolean;
export type CreativeEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface AssetRef { id: string; type: CreativeAssetType; version: string; }
export interface ProjectDependency extends AssetRef { sourceCatalogId?: string; }
export interface CreativeKeyframe { id: string; timeMs: number; value: AssetParamValue; easing: CreativeEasing; }
export type ParamKeyframes = Record<string, CreativeKeyframe[]>;

export interface AnimationInstance {
  assetId: string;
  version: string;
  role: AnimationRole;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
  keyframes: ParamKeyframes;
}

export interface EffectInstance {
  id: string;
  assetId: string;
  version: string;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
  keyframes: ParamKeyframes;
}

export interface TransitionInstance {
  id: string;
  assetId: string;
  version: string;
  incomingItemId: string;
  outgoingItemId: string;
  durationMs: number;
  easing: CreativeEasing;
  params: Record<string, AssetParamValue>;
}

export interface DependencyResolution {
  dependency: ProjectDependency;
  status: 'installed'|'missing';
  installed?: unknown;
}

export function isCreativeAssetType(value: unknown): value is CreativeAssetType {
  return typeof value === "string" && (CREATIVE_ASSET_TYPES as readonly string[]).includes(value);
}

export function normalizeAssetRef(value: AssetRef): AssetRef {
  const id = value.id.trim();
  const version = value.version.trim();
  if (!id) throw new Error("Creative asset id is required");
  if (!version) throw new Error("Creative asset version is required");
  if (!isCreativeAssetType(value.type)) throw new Error(`Unsupported creative asset type: ${String(value.type)}`);
  return { id, type: value.type, version };
}

const CATALOG_FONT_FAMILY=/^LyricForge Catalog .+ \[([a-z0-9][a-z0-9._-]*)@([^\]\s]+)\]$/i;
export function parseCatalogFontFamily(value:unknown):AssetRef|null{
  if(typeof value!=='string')return null;
  const match=value.match(CATALOG_FONT_FAMILY);
  if(!match)return null;
  try{return normalizeAssetRef({id:match[1],type:'font',version:match[2]});}catch{return null;}
}
