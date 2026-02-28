import { describe, it, expect } from "vitest";

describe("GitHub Pages URL Configuration", () => {
  it("should have GITHUB_PAGES_URL env configured", () => {
    const url = process.env.GITHUB_PAGES_URL;
    expect(url).toBeDefined();
    expect(url).toContain("github.io");
    expect(url).toContain("market-regime-monitor");
  });

  it("should have VITE_GITHUB_PAGES_URL env configured", () => {
    const url = process.env.VITE_GITHUB_PAGES_URL;
    expect(url).toBeDefined();
    expect(url).toContain("github.io");
    expect(url).toContain("market-regime-monitor");
  });

  it("should have valid URL format", () => {
    const url = process.env.GITHUB_PAGES_URL!;
    expect(() => new URL(url)).not.toThrow();
    expect(url.startsWith("https://")).toBe(true);
  });
});
