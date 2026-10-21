"use client";

import { useEffect } from "react";

/**
 * Meldet die Inhaltshöhe an die einbettende Seite (iframe-Einbindung).
 * Die Nachricht enthält nur die Höhe – keine Gastdaten –, daher ist das
 * Ziel-Origin "*" unbedenklich. Das Snippet auf der Restaurantseite prüft
 * seinerseits, dass die Nachricht von unserem Origin kommt.
 */
export function AutoHeight({ slug }: { slug: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    // Den Widget-Container messen, nicht <html>/<body>: Diese sind mindestens so hoch
    // wie das iframe selbst und würden ein Schrumpfen verhindern.
    const target = document.querySelector<HTMLElement>(".nova-widget") ?? document.body;
    let last = 0;
    const post = () => {
      const height = Math.ceil(target.getBoundingClientRect().height);
      if (height === last) return;
      last = height;
      window.parent.postMessage({ source: "ae-nova", type: "resize", slug, height }, "*");
    };
    const observer = new ResizeObserver(post);
    observer.observe(target);
    post();
    return () => observer.disconnect();
  }, [slug]);
  return null;
}
