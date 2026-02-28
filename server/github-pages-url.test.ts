import { describe, it, expect } from "vitest";

describe("GitHub Pages URL configuration", () => {
  it("should have VITE_GITHUB_PAGES_URL set with /docs path", () => {
    const url = process.env.VITE_GITHUB_PAGES_URL;
    expect(url).toBeDefined();
    expect(url).toContain("/docs/reports");
    expect(url).toContain("wouhao.github.io/market-regime-monitor");
  });

  it("should be able to fetch latest.json from GitHub Pages", async () => {
    const url = process.env.VITE_GITHUB_PAGES_URL || "https://wouhao.github.io/market-regime-monitor/docs/reports";
    const resp = await fetch(`${url}/latest.json`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.version).toBeDefined();
    expect(data.date).toBeDefined();
    expect(data.regime).toBeDefined();
  });

  it("should be able to fetch index.json from GitHub Pages", async () => {
    const url = process.env.VITE_GITHUB_PAGES_URL || "https://wouhao.github.io/market-regime-monitor/docs/reports";
    const resp = await fetch(`${url}/index.json`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.dates).toBeDefined();
    expect(Array.isArray(data.dates)).toBe(true);
  });
});
