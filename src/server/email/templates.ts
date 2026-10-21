/**
 * E-Mail-Layout: ruhig, gut lesbar, ohne externe Ressourcen (keine Tracking-Pixel,
 * keine Webfonts). Inline-Styles, weil viele Mailprogramme kein <style> kennen.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MailLayoutInput {
  lang: string;
  brandColor: string;
  restaurantName: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  cta?: { label: string; url: string; hint?: string };
  footer: string;
  cancelled?: boolean;
}

/** Text auf der Markenfarbe: weiß oder Tinte, je nach Helligkeit. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#1d2433" : "#ffffff";
}

export function renderMailHtml(input: MailLayoutInput): string {
  const e = escapeHtml;
  const brand = /^#[0-9a-f]{6}$/i.test(input.brandColor) ? input.brandColor : "#6b1e2e";
  const details = input.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0;border-top:1px solid #dcdfe3;border-bottom:1px solid #dcdfe3">
${input.details
  .map(
    (d) => `<tr><td style="padding:10px 16px 10px 0;color:#5b6472;font-size:14px;width:40%;vertical-align:top">${e(d.label)}</td><td style="padding:10px 0;font-size:15px;color:#1d2433;${input.cancelled ? "text-decoration:line-through;" : ""}">${e(d.value)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : "";
  const cta = input.cta
    ? `<p style="margin:28px 0 8px"><a href="${e(input.cta.url)}" style="display:inline-block;background:${brand};color:${contrastText(brand)};text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px">${e(input.cta.label)}</a></p>
${input.cta.hint ? `<p style="margin:0;color:#5b6472;font-size:13px">${e(input.cta.hint)}</p>` : ""}`
    : "";

  return `<!doctype html>
<html lang="${e(input.lang)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.heading)}</title></head>
<body style="margin:0;background:#f6f7f5;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dcdfe3;border-radius:8px">
<tr><td style="padding:28px 32px 0">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${brand};letter-spacing:.02em">${e(input.restaurantName)}</p>
<div style="height:1px;width:48px;background:#9c7a3c;margin:14px 0 0"></div>
</td></tr>
<tr><td style="padding:20px 32px 32px">
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;line-height:1.3">${e(input.heading)}</h1>
${input.greeting ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${e(input.greeting)}</p>` : ""}
${input.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${e(p)}</p>`).join("\n")}
${details}
${cta}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;color:#5b6472;font-size:12px;line-height:1.5">${e(input.footer)}</p>
</td></tr>
</table>
</body>
</html>`;
}

export function renderMailText(input: MailLayoutInput): string {
  const lines = [input.restaurantName, "", input.heading, ""];
  if (input.greeting) lines.push(input.greeting, "");
  lines.push(...input.paragraphs, "");
  for (const d of input.details ?? []) lines.push(`${d.label}: ${d.value}`);
  if (input.cta) lines.push("", `${input.cta.label}: ${input.cta.url}`, input.cta.hint ?? "");
  lines.push("", "—", input.footer);
  return lines.join("\n");
}
