export const CREATIVE_ASSET_TYPES = ["font", "effect", "transition", "text-animation"] as const;
export type CreativeAssetType = (typeof CREATIVE_ASSET_TYPES)[number];
export type AnimationRole = "intro" | "loop" | "outro";
export type AssetParamValue = string | number | boolean;

export interface AssetRef { id: string; type: CreativeAssetType; version: string; }
export interface ProjectDependency extends AssetRef { sourceCatalogId?: string; }

export interface AnimationInstance {
  assetId: string;
  version: string;
  role: AnimationRole;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
}

export interface EffectInstance {
  assetId: string;
  version: string;
  enabled: boolean;
  params: Record<string, AssetParamValue>;
}

export interface TransitionInstance {
  assetId: string;
  version: string;
  incomingItemId: string;
  outgoingItemId: string;
  durationMs: number;
  easing: string;
  params: Record<string, AssetParamValue>;
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
