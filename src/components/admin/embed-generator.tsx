"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminT } from "./i18n-provider";

type Mode = "button" | "inline" | "iframe";

function CopyBlock({ code, label }: { code: string; label: string }) {
  const { t } = useAdminT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre tabIndex={0} aria-label={t("embed.code")} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring rounded-md border bg-muted/50 p-4 pr-24 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="absolute top-2 right-2"
        aria-label={t("embed.copyLabel", { label })}
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? t("embed.copied") : t("embed.copy")}
      </Button>
    </div>
  );
}

/** Embed-Code-Generator mit Live-Vorschau (Vorschau als Beispielseite im iframe). */
export function EmbedGenerator({ appUrl, slug, brandColor, restaurantName }: { appUrl: string; slug: string; brandColor: string; restaurantName: string }) {
  const { t, locale } = useAdminT();
  const [mode, setMode] = useState<Mode>("button");
  const [lang, setLang] = useState<"de" | "en">("de");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(brandColor);

  const code = useMemo(() => {
    const attrs = [`src="${appUrl}/embed.js"`, `data-restaurant="${slug}"`];
    if (mode === "inline") attrs.push(`data-mode="inline"`);
    if (lang === "en") attrs.push(`data-lang="en"`);
    if (mode === "button") {
      if (label.trim()) attrs.push(`data-label="${label.trim().replace(/"/g, "&quot;")}"`);
      attrs.push(`data-color="${color}"`);
    }
    if (mode === "iframe") {
      const src = `${appUrl}/embed/${slug}${lang === "en" ? "?lang=en" : ""}`;
      return `<iframe id="ae-nova-${slug}" src="${src}" title="${lang === "en" ? "Table reservation" : "Tischreservierung"}"
  style="width:100%;height:640px;border:0" loading="lazy" allow="payment; fullscreen" allowfullscreen></iframe>
<script>
  // ${t("embed.resizeComment")}
  window.addEventListener("message", function (e) {
    if (e.origin !== "${appUrl}" || !e.data || e.data.source !== "ae-nova") return;
    if (e.data.type === "resize") document.getElementById("ae-nova-${slug}").style.height = e.data.height + "px";
  });
</script>`;
    }
    return `<script ${attrs.join(" ")} async></script>`;
  }, [appUrl, slug, mode, lang, label, color, t]);

  const previewDoc = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px/1.6 Georgia,serif;color:#333;background:#fff}header{padding:20px 24px;border-bottom:1px solid #eee;font-size:20px}main{padding:24px}p{color:#666;max-width:40em}</style></head>
<body><header>${t("embed.sampleSite", { name: restaurantName.replace(/</g, "&lt;") })}</header><main><p>${t("embed.sampleText")}</p>${code}</main></body></html>`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="button">{t("embed.mode.button")}</TabsTrigger>
            <TabsTrigger value="inline">{t("embed.mode.inline")}</TabsTrigger>
            <TabsTrigger value="iframe">{t("embed.mode.iframe")}</TabsTrigger>
          </TabsList>
          <TabsContent value="button" className="pt-2 text-sm text-muted-foreground">
            {t("embed.help.button")}
          </TabsContent>
          <TabsContent value="inline" className="pt-2 text-sm text-muted-foreground">
            {t("embed.help.inline")}
          </TabsContent>
          <TabsContent value="iframe" className="pt-2 text-sm text-muted-foreground">
            {t("embed.help.iframe")}
          </TabsContent>
        </Tabs>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eg-lang">{t("embed.language")}</Label>
            <select id="eg-lang" value={lang} onChange={(e) => setLang(e.target.value as "de" | "en")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="de">{t("embed.lang.de")}</option>
              <option value="en">{t("embed.lang.en")}</option>
            </select>
          </div>
          {mode === "button" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="eg-label">{t("embed.label")}</Label>
                <Input id="eg-label" value={label} placeholder={lang === "en" ? "Book a table" : "Tisch reservieren"} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eg-color">{t("embed.buttonColor")}</Label>
                <input id="eg-color" type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-9 w-full cursor-pointer rounded-md border" />
              </div>
            </>
          ) : null}
        </div>

        <CopyBlock code={code} label={t("embed.code")} />
        <p className="text-sm text-muted-foreground">
          {t("embed.directLink")}{" "}
          <a href={`${appUrl}/r/${slug}`} className="underline" target="_blank" rel="noreferrer">
            {appUrl}/r/{slug}
          </a>
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{t("embed.preview")}</p>
        <iframe
          key={code}
          title={t("embed.previewTitle")}
          srcDoc={previewDoc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          className="h-[640px] w-full rounded-lg border bg-white"
        />
      </div>
    </div>
  );
}
