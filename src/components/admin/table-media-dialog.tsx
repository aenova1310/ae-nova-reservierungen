"use client";

import { Camera, Rotate3d } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMb, MEDIA_LIMITS } from "@/lib/media-limits";
import { useAdminT } from "./i18n-provider";
import { ImageUpload, mediaRequest } from "./image-upload";

/** Gleiche Form wie TableMediaView aus src/server/media/service.ts (Client-Komponente: kein Server-Import). */
export interface AdminTableMedia {
  kind: "PHOTO" | "PANORAMA_360";
  thumbUrl: string | null;
  url: string;
  altDe: string;
  altEn: string;
  width: number | null;
  height: number | null;
}

/** "So sitzen Sie" pro Tisch pflegen: Foto oder 360°-Panorama, Alternativtexte, Entfernen. */
export function TableMediaDialog({ slug, table, media }: { slug: string; table: { id: string; name: string }; media: AdminTableMedia | null }) {
  const router = useRouter();
  const { t } = useAdminT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"PHOTO" | "PANORAMA_360">(media?.kind ?? "PHOTO");
  const [pending, start] = useTransition();
  const altDe = useRef<HTMLInputElement>(null);
  const altEn = useRef<HTMLInputElement>(null);

  const base = { restaurant: slug, target: "table", tableId: table.id };
  const alts = () => ({ altDe: altDe.current?.value ?? "", altEn: altEn.current?.value ?? "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={t("media.table.trigger", { name: table.name })} className="gap-1.5">
          {media?.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.thumbUrl} alt="" className="h-5 w-7 rounded-[3px] object-cover" />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          {t("media.table.view")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("media.table.title", { name: table.name })}</DialogTitle>
          <DialogDescription>
            {t("media.table.desc")}
          </DialogDescription>
        </DialogHeader>

        {media ? (
          <figure className="overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.thumbUrl ?? media.url} alt={media.altDe} className="aspect-[3/2] w-full object-cover" />
            <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {t(`media.kind.${media.kind}`)} · {media.width} × {media.height}
              </span>
              <a href={media.url} target="_blank" rel="noreferrer" className="underline">{t("media.table.original")}</a>
            </figcaption>
          </figure>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{media ? t("media.table.replace") : t("media.table.kind")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["PHOTO", Camera],
                ["PANORAMA_360", Rotate3d],
              ] as const
            ).map(([value, Icon]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  kind === value ? "border-primary bg-secondary" : "hover:bg-muted/50",
                )}
              >
                <input type="radio" name={`kind-${table.id}`} value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="block font-medium">{t(`media.kind.${value}`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`media.kindDesc.${value}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`alt-de-${table.id}`}>{t("media.table.altDe")}</Label>
            <Input id={`alt-de-${table.id}`} ref={altDe} defaultValue={media?.altDe ?? ""} placeholder={`Blick vom Tisch ${table.name}`} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`alt-en-${table.id}`}>{t("media.table.altEn")}</Label>
            <Input id={`alt-en-${table.id}`} ref={altEn} defaultValue={media?.altEn ?? ""} placeholder={`View from table ${table.name}`} maxLength={200} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">{t("media.table.altHint")}</p>
        </div>

        <ImageUpload
          key={kind}
          fields={{ ...base, kind }}
          extraFields={alts}
          maxBytes={kind === "PANORAMA_360" ? MEDIA_LIMITS.panoramaBytes : MEDIA_LIMITS.photoBytes}
          label={t("media.table.chooseFile")}
          hint={kind === "PANORAMA_360" ? t("media.table.hintPanorama", { mb: formatMb(MEDIA_LIMITS.panoramaBytes) }) : t("media.table.hintPhoto", { mb: formatMb(MEDIA_LIMITS.photoBytes) })}
          onDone={() => setOpen(false)}
          compact
        />

        {media ? (
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await mediaRequest({ ...base, action: "alt", ...alts() });
                  if (r.ok) {
                    toast.success(t("media.table.altSaved"));
                    router.refresh();
                  } else toast.error(r.message ?? t("media.saveFailed"));
                })
              }
            >
              {t("media.table.saveAltOnly")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="text-destructive hover:text-destructive"
              onClick={() =>
                start(async () => {
                  const r = await mediaRequest({ ...base, action: "remove" });
                  if (r.ok) {
                    toast.success(t("media.table.removed"));
                    setOpen(false);
                    router.refresh();
                  } else toast.error(r.message ?? t("media.removeFailed"));
                })
              }
            >
              {t("media.table.remove")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
