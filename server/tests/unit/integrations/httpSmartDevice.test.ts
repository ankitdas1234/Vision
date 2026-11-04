import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { triggerSmartDevice, isValidHttpUrl } from "../../../src/integrations/HttpSmartDevice";

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("http://192.168.1.50/relay/0?turn=on")).toBe(true);
    expect(isValidHttpUrl("https://maker.ifttt.com/trigger/x/y")).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
  });

  it("rejects garbage that isn't a URL at all", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("triggerSmartDevice (against a real local HTTP server, not mocked)", () => {
  let server: Server;
  let baseUrl: string;
  let lastRequest: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string } | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        lastRequest = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
        if (req.url === "/fail") {
          res.writeHead(500);
          res.end("simulated device error");
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address === "object") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(() => {
    server.close();
  });

  it("actually sends a real GET request to the configured URL", async () => {
    const result = await triggerSmartDevice({ name: "test lamp", triggerUrl: `${baseUrl}/relay/0?turn=on`, method: "GET" });
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(lastRequest?.method).toBe("GET");
    expect(lastRequest?.url).toBe("/relay/0?turn=on");
  });

  it("actually sends a real POST request with a body and custom headers", async () => {
    const result = await triggerSmartDevice({
      name: "test webhook",
      triggerUrl: `${baseUrl}/webhook`,
      method: "POST",
      headers: { "X-Custom-Header": "hello", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger" }),
    });
    expect(result.success).toBe(true);
    expect(lastRequest?.method).toBe("POST");
    expect(lastRequest?.headers["x-custom-header"]).toBe("hello");
    expect(lastRequest?.body).toBe(JSON.stringify({ action: "trigger" }));
  });

  it("reports failure with the real status code when the device responds with an error", async () => {
    const result = await triggerSmartDevice({ name: "flaky device", triggerUrl: `${baseUrl}/fail`, method: "GET" });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("defaults to GET for an unrecognized method value", async () => {
    const result = await triggerSmartDevice({ name: "test lamp", triggerUrl: `${baseUrl}/relay/0`, method: "PATCH" });
    expect(result.success).toBe(true);
    expect(lastRequest?.method).toBe("GET");
  });

  it("refuses to trigger a device with a non-http(s) URL rather than attempting the request", async () => {
    const result = await triggerSmartDevice({ name: "malicious", triggerUrl: "file:///etc/passwd", method: "GET" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a valid http/i);
  });

  it("reports a connection failure gracefully rather than throwing", async () => {
    const result = await triggerSmartDevice({ name: "unreachable", triggerUrl: "http://127.0.0.1:1", method: "GET" });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
