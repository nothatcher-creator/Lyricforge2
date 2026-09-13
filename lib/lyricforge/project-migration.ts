import { isCreativeAssetType, normalizeAssetRef, type ProjectDependency } from "./creative-assets";

export const PROJECT_SCHEMA_VERSION = 3;
export type MigratedProjectDocument = Record<string, unknown> & {
  schemaVersion: number;
  dependencies: ProjectDependency[];
  masterEffects: unknown[];
  transitions: unknown[];
  clips?: unknown[];
};

function normalizeDependency(value: unknown): ProjectDependency | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.version !== "string" || !isCreativeAssetType(record.type)) return null;
  try {
    const ref = normalizeAssetRef({ id: record.id, type: record.type, version: record.version });
    return typeof record.sourceCatalogId === "string" && record.sourceCatalogId.trim()
      ? { ...ref, sourceCatalogId: record.sourceCatalogId.trim() }
      : ref;
  } catch {
    return null;
  }
}

function normalizeClipStructure(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const clip = value as Record<string, unknown>;
  return { ...clip, effects: Array.isArray(clip.effects) ? clip.effects : [] };
}

export function migrateProjectDocument(input: unknown): MigratedProjectDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Project document must be an object");
  }

  const source = input as Record<string, unknown>;
  const rawDependencies = Array.isArray(source.dependencies) ? source.dependencies : [];
  const dependencies: ProjectDependency[] = [];
  const seen = new Set<string>();

  for (const raw of rawDependencies) {
    const dependency = normalizeDependency(raw);
    if (!dependency) continue;
    const key = `${dependency.type}:${dependency.id}@${dependency.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(dependency);
  }

  const migrated = {
    ...source,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    dependencies,
    masterEffects: Array.isArray(source.masterEffects) ? source.masterEffects : [],
    transitions: Array.isArray(source.transitions) ? source.transitions : [],
  } as MigratedProjectDocument;

  if (Array.isArray(source.clips)) migrated.clips = source.clips.map(normalizeClipStructure);
  return migrated;
}
