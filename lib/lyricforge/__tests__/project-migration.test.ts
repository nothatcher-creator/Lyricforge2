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

  it("preserves existing built-in effect ids, versions, params, and keyframes without requiring new metadata", () => {
    const legacyEffects = [
      { id: "glow-old", assetId: "builtin.effect.glow", version: "1.0.0", enabled: true, params: { radius: 12, intensity: .4 }, keyframes: {} },
      { id: "brightness-old", assetId: "builtin.effect.brightness", version: "1.0.0", enabled: true, params: { amount: 1.15 }, keyframes: {} },
      { id: "vhs-old", assetId: "builtin.effect.vhs", version: "1.0.0", enabled: true, params: { scanlines: .3, noise: .15, jitter: .1 }, keyframes: {} },
    ];
    const migrated = migrateProjectDocument({
      clips: [{ id: "legacy-text", kind: "text", start: 0, end: 1000, effects: legacyEffects }],
      masterEffects: [legacyEffects[1]],
      transitions: [],
      duration: 1000,
    });
    expect((migrated.clips as any[])[0].effects).toEqual(legacyEffects);
    expect(migrated.masterEffects).toEqual([legacyEffects[1]]);
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
