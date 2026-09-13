import { describe, expect, it } from "vitest";
import { publicPath } from "../public-path";

describe("publicPath", () => {
  it("uses the Pages prefix when the page is under /Lyricforge2", () => {
    expect(publicPath("/workers/analysis.js", "/Lyricforge2/")).toBe("/Lyricforge2/workers/analysis.js");
  });
  it("uses a root public path during local development", () => {
    expect(publicPath("/workers/analysis.js", "/")).toBe("/workers/analysis.js");
  });
  it("does not double-prefix a production path", () => {
    expect(publicPath("/Lyricforge2/favicon.svg", "/Lyricforge2/editor")).toBe("/Lyricforge2/favicon.svg");
  });
});
