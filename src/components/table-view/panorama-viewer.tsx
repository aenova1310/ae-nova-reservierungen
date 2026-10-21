"use client";

import "@photo-sphere-viewer/core/index.css";
import { Viewer } from "@photo-sphere-viewer/core";
import { useEffect, useRef, useState } from "react";

export interface PanoramaTexts {
  hint: string;
  error: string;
  lang: "de" | "en";
}

const LANG_DE: Record<string, string> = {
  zoom: "Zoom",
  zoomOut: "Verkleinern",
  zoomIn: "Vergrößern",
  moveUp: "Nach oben",
  moveDown: "Nach unten",
  moveLeft: "Nach links",
  moveRight: "Nach rechts",
  fullscreen: "Vollbild",
  loading: "Wird geladen …",
  menu: "Menü",
  close: "Schließen",
  twoFingers: "Mit zwei Fingern bewegen",
  ctrlZoom: "Strg + Mausrad zum Zoomen",
  loadError: "Das Panorama konnte nicht geladen werden",
  webglError: "Ihr Browser unterstützt keine 3D-Darstellung (WebGL)",
};

/**
 * Interaktiver 360°-Viewer (Photo Sphere Viewer, lokal gebündelt – keine
 * Requests an Dritte). Wird per next/dynamic erst bei Bedarf geladen.
 * Tastatur: Pfeiltasten und +/− funktionieren, sobald der Viewer fokussiert ist.
 */
export default function PanoramaViewer({ url, alt, texts }: { url: string; alt: string; texts: PanoramaTexts }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let viewer: Viewer | null = null;
    // Einen Takt verzögert starten: Wird der Effekt sofort wieder abgebaut (React
    // Strict Mode, schneller Tischwechsel), beginnt gar kein Download. Sonst bricht
    // destroy() den Ladevorgang ab und der nächste Viewer hängt an ihm fest.
    const timer = window.setTimeout(() => {
      try {
        viewer = new Viewer({
          container,
          panorama: url,
          caption: alt,
          navbar: ["zoom", "move", "caption", "fullscreen"],
          // Tastatur nur, solange der Viewer fokussiert ist (siehe onFocus/onBlur) –
          // sonst würden Pfeiltasten im Kontaktformular das Panorama drehen
          keyboard: false,
          mousewheelCtrlKey: true, // Seite scrollt weiter, Zoom nur mit Strg
          touchmoveTwoFingers: false,
          defaultZoomLvl: 30,
          loadingTxt: texts.lang === "de" ? "Wird geladen …" : "Loading …",
          lang: texts.lang === "de" ? LANG_DE : undefined,
        });
        viewer.addEventListener("panorama-error", () => setFailed(true));
        viewerRef.current = viewer;
      } catch {
        // z. B. kein WebGL
        setFailed(true);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [url, alt, texts.lang]);

  if (failed) return <p className="px-4 py-6 text-sm text-muted-foreground">{texts.error}</p>;
  return (
    <div>
      <div
        ref={ref}
        role="application"
        aria-label={alt}
        tabIndex={0}
        onFocus={() => viewerRef.current?.startKeyboardControl()}
        onBlur={(e) => {
          // Fokus innerhalb des Viewers (z. B. Navigationsleiste) behält die Tastatursteuerung
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) viewerRef.current?.stopKeyboardControl();
        }}
        className="aspect-[16/10] w-full overflow-hidden rounded-md bg-black"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{texts.hint}</p>
    </div>
  );
}
