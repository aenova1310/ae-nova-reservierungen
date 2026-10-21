"use client";

import { ImageIcon } from "lucide-react";
import { useState, type ComponentType } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * "So sitzen Sie" – Vorschau eines Tisches.
 *
 * Gekapselt über eine Renderer-Registry: Jede Medienart (Foto, 360°, später
 * Video oder 3D) registriert eine eigene Komponente. Das Widget kennt nur
 * <TableViewPreview>, neue Medienarten erfordern keine Änderung am Widget.
 *
 * Phase 1: Foto (Lightbox) und Platzhalter. Der 360°-Viewer (Photo Sphere
 * Viewer, lokal gebündelt) folgt in Phase 2 als weiterer Registry-Eintrag.
 */
export type TableMediaKind = "PHOTO" | "PANORAMA_360" | "VIDEO" | "MODEL_3D";

export interface TableMediaView {
  kind: TableMediaKind;
  url: string;
  alt: string;
}

interface RendererProps {
  media: TableMediaView;
  label: string;
}

function PhotoRenderer({ media, label }: RendererProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full overflow-hidden rounded-md border focus-visible:outline-2"
        aria-label={`${label}: ${media.alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Medien aus dem Objektspeicher, Größe unbekannt */}
        <img src={media.url} alt={media.alt} className="aspect-[3/2] w-full object-cover transition-transform group-hover:scale-[1.02]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt={media.alt} className="w-full rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
}

const RENDERERS: Partial<Record<TableMediaKind, ComponentType<RendererProps>>> = {
  PHOTO: PhotoRenderer,
  // PANORAMA_360: PanoramaRenderer – Phase 2
  // VIDEO / MODEL_3D – vorbereitet
};

export function TableViewPreview({
  media,
  label,
  emptyText,
}: {
  media: TableMediaView | null;
  label: string;
  emptyText: string;
}) {
  const Renderer = media ? RENDERERS[media.kind] : undefined;
  if (media && Renderer) return <Renderer media={media} label={label} />;
  return (
    <div className="flex w-full items-center gap-3 rounded-md border border-dashed bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
      <ImageIcon className="size-5 shrink-0" aria-hidden />
      <span>{emptyText}</span>
    </div>
  );
}
