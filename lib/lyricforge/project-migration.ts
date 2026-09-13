import { isCreativeAssetType, normalizeAssetRef, type ProjectDependency } from "./creative-assets";

export const PROJECT_SCHEMA_VERSION = 2;
export type MigratedProjectDocument = Record<string, unknown> & {
  schemaVersion: number;
  dependencies: ProjectDependency[];
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

  return { ...source, schemaVersion: PROJECT_SCHEMA_VERSION, dependencies };
}
