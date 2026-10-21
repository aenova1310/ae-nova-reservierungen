import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/http/request";

describe("Client-IP hinter dem Reverse-Proxy", () => {
  it("nimmt den vom Proxy angehängten letzten Eintrag, nicht den gefälschten ersten", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "6.6.6.6" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
