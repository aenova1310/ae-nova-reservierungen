"use client";

import { Expand, ImageIcon, Rotate3d } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { PanoramaTexts } from "./panorama-viewer";

/**
 * "So sitzen Sie" – Vorschau eines Tisches.
 *
 * Gekapselt über eine Renderer-Registry: Jede Medienart registriert eine eigene
 * Komponente. Das Widget kennt nur <TableViewPreview>; Video oder 3D kommen als
 * weiterer Registry-Eintrag dazu, ohne Änderung am Widget.
 *
 * Bewusst ohne modalen Dialog: Im eingebetteten iframe (automatische Höhe) läge
 * ein Overlay außerhalb des sichtbaren Bereichs der Restaurant-Website.
 * Stattdessen inline + Browser-Vollbild (funktioniert auch im iframe).
 */
export type TableMediaKind = "PHOTO" | "PANORAMA_360" | "VIDEO" | "MODEL_3D";

export interface TableMediaView {
  kind: TableMediaKind;
  url: string;
  thumbUrl: string | null;
  alt: string;
}

export interface TableViewTexts {
  enlarge: string;
  start360: string;
  hint360: string;
  error360: string;
  lang: "de" | "en";
}

interface RendererProps {
  media: TableMediaView;
  texts: TableViewTexts;
}

function PhotoRenderer({ media, texts }: RendererProps) {
  const figure = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Dauerhafter Listener: erkennt Ein- UND Austritt (Esc, Zurück-Geste)
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === figure.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enlarge = async () => {
    const el = figure.current;
    if (!el) return;
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* Vollbild nicht erlaubt → neues Fenster */
      }
    }
    window.open(media.url, "_blank", "noopener");
  };

  return (
    <figure ref={figure} className="group relative overflow-hidden rounded-md border bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element -- Medien über /media, Größe bekannt durch Seitenverhältnis */}
      <img
        src={fullscreen ? media.url : (media.thumbUrl ?? media.url)}
        // Im Vollbild immer das große Bild – srcSet würde sonst die kleine Vorschau wählen
        srcSet={!fullscreen && media.thumbUrl ? `${media.thumbUrl} 480w, ${media.url} 2000w` : undefined}
        sizes={fullscreen ? undefined : "(min-width: 520px) 480px, 100vw"}
        alt={media.alt}
        loading="lazy"
        className={fullscreen ? "h-full w-full object-contain" : "aspect-[3/2] w-full object-cover"}
      />
      <button
        type="button"
        onClick={enlarge}
        aria-pressed={fullscreen}
        className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs text-white backdrop-blur hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-white"
      >
        <Expand className="size-3.5" aria-hidden />
        {texts.enlarge}
      </button>
    </figure>
  );
}

const PanoramaViewer = dynamic(() => import("./panorama-viewer"), {
  ssr: false,
  loading: () => <div className="aspect-[16/10] w-full animate-pulse rounded-md bg-muted" />,
});

function PanoramaRenderer({ media, texts }: RendererProps) {
  const [started, setStarted] = useState(false);
  const panoTexts: PanoramaTexts = { hint: texts.hint360, error: texts.error360, lang: texts.lang };
  if (started) return <PanoramaViewer url={media.url} alt={media.alt} texts={panoTexts} />;
  // Vorschaubild statt sofortigem Laden: spart ~600 kB (three.js) und Datenvolumen
  return (
    <button
      type="button"
      onClick={() => setStarted(true)}
      className="group relative block w-full overflow-hidden rounded-md border bg-black text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {media.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumbUrl} alt={media.alt} loading="lazy" className="aspect-[3/2] w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      ) : (
        <span className="block aspect-[3/2] w-full" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-black/65 px-4 py-2 text-sm text-white backdrop-blur">
          <Rotate3d className="size-4" aria-hidden />
          {texts.start360}
        </span>
      </span>
    </button>
  );
}

const RENDERERS: Partial<Record<TableMediaKind, ComponentType<RendererProps>>> = {
  PHOTO: PhotoRenderer,
  PANORAMA_360: PanoramaRenderer,
  // VIDEO / MODEL_3D: vorbereitet – Renderer hier registrieren
};

export function TableViewPreview({
  media,
  emptyText,
  texts,
}: {
  media: TableMediaView | null;
  emptyText: string;
  texts: TableViewTexts;
}) {
  const Renderer = media ? RENDERERS[media.kind] : undefined;
  if (media && Renderer) return <Renderer media={media} texts={texts} />;
  return (
    <div className="flex w-full items-center gap-3 rounded-md border border-dashed bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
      <ImageIcon className="size-5 shrink-0" aria-hidden />
      <span>{emptyText}</span>
    </div>
  );
}
