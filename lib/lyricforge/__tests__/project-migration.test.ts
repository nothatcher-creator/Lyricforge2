import { describe, expect, it } from "vitest";
import { migrateProjectDocument, PROJECT_SCHEMA_VERSION } from "../project-migration";

describe("migrateProjectDocument", () => {
  it("adds dependency metadata to a legacy project without changing content", () => {
    const legacy = { name: "Song", layers: [{ id: "lyrics-1", type: "text", text: "Hello" }] };
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.dependencies).toEqual([]);
    expect(migrated.layers).toEqual(legacy.layers);
  });

  it("adds creative runtime defaults without changing legacy timing or effect clips", () => {
    const legacy = { clips: [{ id: "fx-old", kind: "effect", start: 100, end: 900 }], duration: 1000 };
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.masterEffects).toEqual([]);
    expect(migrated.transitions).toEqual([]);
    expect((migrated.clips as any[])[0]).toMatchObject({ id: "fx-old", kind: "effect", start: 100, end: 900, effects: [] });
  });

  it("is idempotent for already migrated creative fields", () => {
    const once = migrateProjectDocument({ clips: [], masterEffects: [], transitions: [], dependencies: [] });
    expect(migrateProjectDocument(once)).toEqual(once);
  });

  it("normalizes and de-duplicates valid dependencies", () => {
    const migrated = migrateProjectDocument({ dependencies: [
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
    ] });
    expect(migrated.dependencies).toEqual([
      { id: "catalog.glow", type: "effect", version: "1.0.0", sourceCatalogId: "official" },
    ]);
  });

  it("drops malformed dependencies while preserving other project fields", () => {
    const migrated = migrateProjectDocument({ title: "Keep me", dependencies: [
      { id: "", type: "effect", version: "1.0.0" },
      { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
    ] });
    expect(migrated.title).toBe("Keep me");
    expect(migrated.dependencies).toEqual([
      { id: "catalog.fade", type: "text-animation", version: "1.1.0" },
    ]);
  });

  it("rejects non-object documents", () => {
    expect(() => migrateProjectDocument(null)).toThrow("Project document must be an object");
    expect(() => migrateProjectDocument("bad")).toThrow("Project document must be an object");
  });
});
