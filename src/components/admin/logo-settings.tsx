"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMb, MEDIA_LIMITS } from "@/lib/media-limits";
import { useAdminT } from "./i18n-provider";
import { ImageUpload, mediaRequest } from "./image-upload";

export function LogoSettings({ slug, logo, restaurantName }: { slug: string; logo: { url: string; width: number; height: number } | null; restaurantName: string }) {
  const router = useRouter();
  const { t } = useAdminT();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <ImageUpload
        fields={{ restaurant: slug, target: "logo" }}
        maxBytes={MEDIA_LIMITS.logoBytes}
        label={logo ? t("media.logo.chooseNew") : t("media.logo.choose")}
        hint={t("media.logo.hint", { mb: formatMb(MEDIA_LIMITS.logoBytes) })}
        compact
      />
      <div className="flex flex-col items-start justify-center gap-2 rounded-md border bg-background p-4">
        <p className="text-xs text-muted-foreground">{t("media.logo.preview")}</p>
        {logo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.url} alt={t("media.logo.alt", { name: restaurantName })} width={logo.width} height={logo.height} className="h-auto max-h-14 w-auto max-w-full object-contain" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="text-destructive hover:text-destructive"
              onClick={() =>
                start(async () => {
                  const r = await mediaRequest({ restaurant: slug, target: "logo", action: "remove" });
                  if (r.ok) {
                    toast.success(t("media.logo.removed"));
                    router.refresh();
                  } else toast.error(r.message ?? t("media.removeFailed"));
                })
              }
            >
              {t("media.logo.remove")}
            </Button>
          </>
        ) : (
          <p className="font-display text-xl">{restaurantName}</p>
        )}
      </div>
    </div>
  );
}
