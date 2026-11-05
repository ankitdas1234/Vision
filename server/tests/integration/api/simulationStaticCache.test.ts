import { describe, it, expect } from "vitest";
import express from "express";
import { simulationStatic } from "../../../src/routes/simulation.routes";

describe("simulator static files", () => {
  it("pages, scripts and styles are re-checked on every load; big assets may be cached", async () => {
    const app = express(); app.use("/simulation", simulationStatic);
    const s = await new Promise<{ url: string; close: () => void }>((r) => { const h = app.listen(0, () => r({ url: `http://127.0.0.1:${(h.address() as any).port}/simulation`, close: () => h.close() })); });
    try {
      for (const f of ["/css/shell.css", "/js/shell.js", "/index.html"]) {
        const res = await fetch(s.url + f);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-cache");
      }
      const logo = await fetch(s.url + "/assets/logo/Vision.png");
      expect(logo.status).toBe(200);
      expect(logo.headers.get("cache-control")).toContain("max-age=3600");
    } finally { s.close(); }
  });
});
