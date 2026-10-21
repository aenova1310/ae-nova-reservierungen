/**
 * A&E NOVA Reservierungen – Einbettungs-Skript (wird zu public/embed.js gebaut).
 *
 *   <script src="https://app.example/embed.js" data-restaurant="pastahaus"
 *           data-mode="button|inline" data-lang="de|en" data-label="…"
 *           data-color="#6B1E2E" data-target="#reservierung" async></script>
 *
 * - "button": Button, der das Widget in einem barrierearmen Dialog öffnet
 * - "inline": Widget direkt an Ort und Stelle (oder im Element `data-target`)
 * Intern immer ein iframe (Isolation von CSS/JS der Seite, Gastdaten bleiben in
 * unserem Origin). Button und Dialog liegen im Shadow DOM. Keine Cookies,
 * kein Tracking.
 */
(() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;
  const origin = new URL(script.src).origin;
  const slug = script.dataset.restaurant;
  if (!slug) {
    console.warn("[A&E NOVA] data-restaurant fehlt am Script-Tag.");
    return;
  }
  const mode = script.dataset.mode === "inline" ? "inline" : "button";
  const lang = script.dataset.lang === "en" ? "en" : "de";
  const color = /^#[0-9a-f]{6}$/i.test(script.dataset.color ?? "") ? script.dataset.color! : "#1D2433";
  const label = script.dataset.label || (lang === "en" ? "Book a table" : "Tisch reservieren");
  const src = `${origin}/embed/${encodeURIComponent(slug)}${lang === "en" ? "?lang=en" : ""}`;

  const frames = new Set<HTMLIFrameElement>();

  // Höhe aus dem Widget übernehmen – nur Nachrichten von unserem Origin akzeptieren
  window.addEventListener("message", (event) => {
    if (event.origin !== origin) return;
    const data = event.data as { source?: string; type?: string; slug?: string; height?: number };
    if (data?.source !== "ae-nova" || data.type !== "resize" || typeof data.height !== "number") return;
    for (const frame of frames) {
      if (frame.contentWindow === event.source) frame.style.height = `${Math.max(320, Math.ceil(data.height))}px`;
    }
  });

  function createFrame(): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.src = src;
    frame.title = lang === "en" ? "Table booking" : "Tischreservierung";
    frame.loading = "lazy";
    frame.allow = "payment; fullscreen";
    frame.allowFullscreen = true;
    frame.style.cssText = "display:block;width:100%;height:640px;border:0;background:transparent;";
    frames.add(frame);
    return frame;
  }

  function contrastText(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const lum = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.4 ? "#1D2433" : "#FFFFFF";
  }

  if (mode === "inline") {
    const target = script.dataset.target ? document.querySelector(script.dataset.target) : null;
    const host = document.createElement("div");
    host.className = "ae-nova-widget";
    host.appendChild(createFrame());
    if (target) target.appendChild(host);
    else script.insertAdjacentElement("afterend", host);
    return;
  }

  // Button + Dialog im Shadow DOM
  const host = document.createElement("span");
  host.className = "ae-nova-button";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button.open { font: 500 16px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; background: ${color};
        color: ${contrastText(color)}; border: 0; border-radius: 6px; padding: 12px 20px; cursor: pointer; }
      button.open:focus-visible, button.close:focus-visible { outline: 2px solid ${color}; outline-offset: 2px; }
      .backdrop { position: fixed; inset: 0; z-index: 2147483000; background: rgba(20, 24, 31, .55);
        display: flex; align-items: flex-end; justify-content: center; }
      .dialog { position: relative; width: 100%; max-width: 520px; max-height: 92dvh; overflow: auto;
        background: #F6F7F5; border-radius: 12px 12px 0 0; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
      @media (min-width: 640px) { .backdrop { align-items: center; } .dialog { border-radius: 12px; max-height: 88dvh; } }
      .bar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: flex-end; padding: 8px 8px 0;
        background: #F6F7F5; }
      .close { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #DCDFE3; background: #fff;
        color: #1D2433; font-size: 20px; line-height: 1; cursor: pointer; }
      @media (prefers-reduced-motion: no-preference) { .dialog { animation: rise .18s ease-out; } }
      @keyframes rise { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
    </style>
    <button class="open" type="button" aria-haspopup="dialog">${label.replace(/</g, "&lt;")}</button>`;
  script.insertAdjacentElement("afterend", host);

  const openButton = root.querySelector<HTMLButtonElement>("button.open")!;
  let backdrop: HTMLDivElement | null = null;
  let previousOverflow = "";

  function close() {
    if (!backdrop) return;
    backdrop.querySelectorAll("iframe").forEach((f) => frames.delete(f));
    backdrop.remove();
    backdrop = null;
    document.documentElement.style.overflow = previousOverflow;
    document.removeEventListener("keydown", onKey, true);
    openButton.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    // Fokus im Dialog halten (Schließen-Button ↔ iframe)
    if (event.key === "Tab" && backdrop) {
      const closeBtn = root.querySelector<HTMLButtonElement>("button.close");
      const frame = root.querySelector("iframe");
      const active = root.activeElement;
      if (event.shiftKey && active === closeBtn) {
        event.preventDefault();
        frame?.focus();
      } else if (!event.shiftKey && active === frame) {
        event.preventDefault();
        closeBtn?.focus();
      }
    }
  }

  openButton.addEventListener("click", () => {
    if (backdrop) return;
    backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${label.replace(/"/g, "&quot;")}">
      <div class="bar"><button class="close" type="button" aria-label="${lang === "en" ? "Close" : "Schließen"}">×</button></div></div>`;
    const dialog = backdrop.querySelector<HTMLDivElement>(".dialog")!;
    dialog.appendChild(createFrame());
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    dialog.querySelector<HTMLButtonElement>("button.close")!.addEventListener("click", close);
    root.appendChild(backdrop);
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey, true);
    dialog.querySelector<HTMLButtonElement>("button.close")!.focus();
  });
})();
