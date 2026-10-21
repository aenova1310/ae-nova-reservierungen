import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "@/server/email/ics";
import { contrastRatio, readableOn } from "@/lib/color";
import { getTranslator } from "@/i18n/messages";

describe("ICS", () => {
  it("maskiert Sonderzeichen nach RFC 5545", () => {
    expect(escapeText("Tisch 4; Fenster, ruhig\nDanke")).toBe("Tisch 4\\; Fenster\\, ruhig\\nDanke");
  });

  it("faltet lange Zeilen auf 75 Oktette, auch mit Umlauten", () => {
    const folded = foldLine(`DESCRIPTION:${"Ä".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("erzeugt Storno mit METHOD:CANCEL und gleicher UID", () => {
    const base = { uid: "r1@ae-nova", start: new Date("2026-11-03T18:00:00Z"), end: new Date("2026-11-03T20:00:00Z"), summary: "Pastahaus" };
    const confirmed = buildIcs({ ...base, sequence: 0 });
    const cancelled = buildIcs({ ...base, sequence: 2, cancelled: true });
    expect(confirmed).toContain("METHOD:PUBLISH");
    expect(cancelled).toContain("METHOD:CANCEL");
    expect(cancelled).toContain("SEQUENCE:2");
    expect(cancelled).toContain("UID:r1@ae-nova");
    expect(confirmed.endsWith("\r\n")).toBe(true);
  });
});

describe("Farbkontrast", () => {
  it("wählt lesbare Textfarbe auf der Markenfarbe", () => {
    expect(readableOn("#6B1E2E")).toBe("#ffffff");
    expect(readableOn("#F2D27A")).toBe("#1d2433");
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
});

describe("Übersetzungen", () => {
  it("ersetzt Platzhalter und Pluralformen", () => {
    expect(getTranslator("de")("widget.persons", { count: 1 })).toBe("1 Person");
    expect(getTranslator("en")("widget.persons", { count: 4 })).toBe("4 guests");
  });
});
