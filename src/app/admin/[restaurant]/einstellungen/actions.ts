"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { contrastRatio, isHexColor } from "@/lib/color";
import { WIDGET_FONTS } from "@/lib/fonts";
import { db } from "@/server/db";
import { formObject, runAction } from "@/server/http/admin-action";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const refresh = (slug: string) => {
  revalidatePath(`/admin/${slug}`, "layout");
  revalidatePath(`/r/${slug}`);
  revalidatePath(`/embed/${slug}`);
};
const int = (min: number, max: number) => z.coerce.number().int().min(min, `Mindestens ${min}`).max(max, `Höchstens ${max}`);

const rulesSchema = z
  .object({
    allocationMode: z.enum(["GUEST_CHOOSES_TABLE", "AUTOMATIC"]),
    confirmationMode: z.enum(["AUTOMATIC", "MANUAL"]),
    slotIntervalMinutes: int(5, 120),
    bufferMinutes: int(0, 120),
    minPartySize: int(1, 20),
    maxPartySizeOnline: int(1, 50),
    minLeadTimeMinutes: int(0, 7 * 24 * 60),
    maxAdvanceDays: int(1, 365),
    onlineQuotaPercent: int(0, 100),
  })
  .refine((d) => d.maxPartySizeOnline >= d.minPartySize, { message: "Muss ≥ Mindestgröße sein", path: ["maxPartySizeOnline"] });

export async function saveBookingRulesAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const data = rulesSchema.parse(formObject(formData));
    await tdb.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data });
    refresh(slug);
    return "Buchungsregeln gespeichert.";
  });
}

const brandingSchema = z.object({
  primaryColor: z.string().refine(isHexColor, "Farbe im Format #RRGGBB"),
  fontFamily: z.enum(Object.keys(WIDGET_FONTS) as [string, ...string[]]),
  themeMode: z.enum(["LIGHT", "DARK"]),
  cornerStyle: z.enum(["sharp", "soft", "round"]),
});

export async function saveBrandingAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const data = brandingSchema.parse(formObject(formData));
    data.primaryColor = data.primaryColor.toUpperCase();
    await tdb.branding.upsert({
      where: { restaurantId: restaurant.id },
      update: data,
      create: { ...data, restaurantId: restaurant.id },
    });
    refresh(slug);
    // Buttons brauchen mind. 3:1 Kontrast zum hellen Hintergrund (WCAG 1.4.11)
    const ratio = contrastRatio(data.primaryColor, "#F6F7F5");
    return ratio < 3
      ? `Gespeichert. Hinweis: Die Farbe ist sehr hell (Kontrast ${ratio.toFixed(1)}:1) – Buttons sind schlecht erkennbar. Empfohlen ist eine dunklere Variante.`
      : "Erscheinungsbild gespeichert.";
  });
}

const privacySchema = z.object({
  privacyNoticeDe: z.string().max(3000).optional(),
  privacyNoticeEn: z.string().max(3000).optional(),
  privacyPolicyUrl: z.string().url("Bitte vollständige URL (https://…)").optional(),
  anonymizeAfterDays: int(30, 180),
});

export async function savePrivacyAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const data = privacySchema.parse(formObject(formData));
    const current = await tdb.restaurantSettings.findUniqueOrThrow({ where: { restaurantId: restaurant.id } });
    const textChanged =
      (data.privacyNoticeDe ?? null) !== current.privacyNoticeDe || (data.privacyNoticeEn ?? null) !== current.privacyNoticeEn;
    await tdb.restaurantSettings.update({
      where: { restaurantId: restaurant.id },
      data: {
        privacyNoticeDe: data.privacyNoticeDe ?? null,
        privacyNoticeEn: data.privacyNoticeEn ?? null,
        privacyPolicyUrl: data.privacyPolicyUrl ?? null,
        anonymizeAfterDays: data.anonymizeAfterDays,
        // Jede Textänderung erhöht die Version – bei Buchungen wird die gelesene Version gespeichert
        privacyNoticeVersion: textChanged ? { increment: 1 } : undefined,
      },
    });
    refresh(slug);
    return textChanged ? "Datenschutzhinweis gespeichert (neue Version)." : "Gespeichert.";
  });
}

const contactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email("Ungültige E-Mail"),
  phone: z.string().max(40).optional(),
  street: z.string().max(100).optional(),
  postalCode: z.string().max(10).optional(),
  city: z.string().max(60).optional(),
  websiteUrl: z.string().url("Bitte vollständige URL (https://…)").optional(),
});

export async function saveContactAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const data = contactSchema.parse(formObject(formData));
    // Restaurant selbst ist kein Tenant-Modell; Zugriff ist durch requireRestaurantAccess geprüft
    await db.restaurant.update({
      where: { id: restaurant.id },
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        street: data.street ?? null,
        postalCode: data.postalCode ?? null,
        city: data.city ?? null,
        websiteUrl: data.websiteUrl ?? null,
      },
    });
    refresh(slug);
    return "Kontaktdaten gespeichert.";
  });
}
