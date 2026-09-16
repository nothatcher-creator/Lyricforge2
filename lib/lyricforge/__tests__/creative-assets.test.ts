import { describe, expect, it } from "vitest";
import { isCreativeAssetType, normalizeAssetRef } from "../creative-assets";

describe("creative asset references", () => {
  it("accepts only supported creative asset types", () => {
    for (const type of ["font", "effect", "transition", "text-animation", "element"]) expect(isCreativeAssetType(type)).toBe(true);
    expect(isCreativeAssetType("script")).toBe(false);
  });

  it("normalizes a stable reference", () => {
    expect(normalizeAssetRef({ id: " builtin.fade ", type: "text-animation", version: " 1.0.0 " }))
      .toEqual({ id: "builtin.fade", type: "text-animation", version: "1.0.0" });
  });

  it("rejects blank ids and versions", () => {
    expect(() => normalizeAssetRef({ id: "", type: "effect", version: "1.0.0" })).toThrow();
    expect(() => normalizeAssetRef({ id: "builtin.glow", type: "effect", version: "" })).toThrow();
  });
});
