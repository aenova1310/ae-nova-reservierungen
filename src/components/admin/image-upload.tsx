"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Bild-Upload mit Ziehen & Ablegen, Fortschritt und klaren Fehlermeldungen.
 * Prüft Typ und Größe schon im Browser (schnelles Feedback); die verbindliche
 * Prüfung und Verarbeitung passiert serverseitig (/api/admin/media).
 */
export function ImageUpload({
  fields,
  maxBytes,
  label,
  hint,
  extraFields,
  onDone,
  compact = false,
}: {
  /** Formularfelder für /api/admin/media (restaurant, target, tableId, kind …) */
  fields: Record<string, string>;
  maxBytes: number;
  label: string;
  hint?: string;
  /** Zusätzliche Felder, die zum Zeitpunkt des Uploads gelesen werden (z. B. Alt-Text) */
  extraFields?: () => Record<string, string>;
  onDone?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) => {
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) {
      setError(file.type === "image/svg+xml" ? "SVG ist aus Sicherheitsgründen nicht erlaubt. Bitte PNG oder JPG verwenden." : "Bitte ein JPG-, PNG-, WebP- oder AVIF-Bild wählen.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`Die Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, erlaubt sind ${Math.round(maxBytes / 1024 / 1024)} MB).`);
      return;
    }
    const data = new FormData();
    for (const [k, v] of Object.entries({ ...fields, ...(extraFields?.() ?? {}) })) data.set(k, v);
    data.set("file", file);

    // XHR statt fetch, weil fetch keinen Upload-Fortschritt liefert
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: { message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* leere Antwort */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success("Bild gespeichert.");
        router.refresh();
        onDone?.();
      } else {
        setError(body.message ?? "Upload fehlgeschlagen. Bitte erneut versuchen.");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    };
    setProgress(0);
    xhr.send(data);
  };

  const busy = progress !== null;
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) upload(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center transition-colors",
          compact ? "px-4 py-4" : "px-6 py-8",
          dragging ? "border-primary bg-secondary" : "bg-muted/30",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm">
          Bild hierher ziehen oder{" "}
          <Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={() => input.current?.click()}>
            {label}
          </Button>
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        {busy ? (
          <div className="mt-2 w-full max-w-xs" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Upload-Fortschritt">
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{progress === 100 ? "Wird verarbeitet …" : `${progress} %`}</p>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Kleine Hilfsfunktion für Entfernen/Alt-Text über dieselbe Route. */
export async function mediaRequest(fields: Record<string, string>): Promise<{ ok: boolean; message?: string }> {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  const res = await fetch("/api/admin/media", { method: "POST", body: data });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, message: body.message };
}
