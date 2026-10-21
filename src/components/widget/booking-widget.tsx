"use client";

import { de as dayPickerDe, enGB as dayPickerEn } from "react-day-picker/locale";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableViewPreview } from "@/components/table-view/table-view-preview";
import { formatDuration, getTranslator, type Locale, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { PlaceCard } from "./place-card";
import type { BookingResult, WidgetAvailability, WidgetCandidate, WidgetRestaurant, WidgetSlot } from "./types";

type Step = "party" | "date" | "time" | "seat" | "contact" | "done";

interface Contact {
  name: string;
  email: string;
  phone: string;
  notes: string;
  privacy: boolean;
  website: string; // Honeypot
}

const EMPTY_CONTACT: Contact = { name: "", email: "", phone: "", notes: "", privacy: false, website: "" };

/** "2026-11-03" → Date (12:00 UTC, damit die Anzeige in keiner Zeitzone springt). */
const dateFromKey = (key: string) => new Date(`${key}T12:00:00Z`);
const keyFromDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;

function formatDateShort(key: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateFromKey(key));
}

export function BookingWidget({
  restaurant,
  initialLocale,
  embedded = false,
}: {
  restaurant: WidgetRestaurant;
  initialLocale: Locale;
  embedded?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = useMemo(() => getTranslator(locale), [locale]);

  const [step, setStep] = useState<Step>("party");
  const [party, setParty] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<WidgetSlot | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [table, setTable] = useState<WidgetCandidate | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [result, setResult] = useState<BookingResult | null>(null);

  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<WidgetAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Nach jedem Schrittwechsel den Fokus auf die Überschrift setzen (Screenreader, Tastatur)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const switchLocale = () => {
    const next: Locale = locale === "de" ? "en" : "de";
    setLocale(next);
    const url = new URL(window.location.href);
    if (next === "de") url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  };

  const api = `/api/public/${encodeURIComponent(restaurant.slug)}`;

  const loadDays = useCallback(
    async (fromKey: string, partySize: number) => {
      const month = monthStart(fromKey);
      if (loadedMonths.has(`${month}:${partySize}`)) return;
      const from = month < restaurant.today ? restaurant.today : month;
      const res = await fetch(`${api}/days?from=${from}&party=${partySize}&days=42`);
      if (!res.ok) return;
      const data: { days: { date: string; available: boolean }[] } = await res.json();
      setAvailableDays((prev) => {
        const next = new Set(prev);
        for (const d of data.days) {
          if (d.available) next.add(d.date);
          else next.delete(d.date);
        }
        return next;
      });
      setLoadedMonths((prev) => new Set(prev).add(`${month}:${partySize}`));
    },
    [api, loadedMonths, restaurant.today],
  );

  const loadAvailability = useCallback(
    async (dateKey: string, partySize: number) => {
      setLoading(true);
      setError(null);
      setAvailability(null);
      try {
        const res = await fetch(`${api}/availability?date=${dateKey}&party=${partySize}`);
        if (!res.ok) throw new Error(String(res.status));
        setAvailability(await res.json());
      } catch {
        setError(t("widget.error.generic"));
      } finally {
        setLoading(false);
      }
    },
    [api, t],
  );

  const chooseParty = (n: number) => {
    setParty(n);
    setSlot(null);
    setTable(null);
    setAvailableDays(new Set());
    setLoadedMonths(new Set());
    void loadDays(date ?? restaurant.today, n);
    setStep(date ? "time" : "date");
    if (date) void loadAvailability(date, n);
  };

  const chooseDate = (d: Date | undefined) => {
    if (!d || !party) return;
    const key = keyFromDate(d);
    setDate(key);
    setSlot(null);
    setTable(null);
    void loadAvailability(key, party);
    setStep("time");
  };

  const needsSeatStep = (s: WidgetSlot) =>
    restaurant.allocationMode === "GUEST_CHOOSES_TABLE" ? s.candidates.length > 0 : s.areaIds.length > 1;

  const chooseSlot = (s: WidgetSlot) => {
    setSlot(s);
    setTable(null);
    setAreaId(null);
    setStep(needsSeatStep(s) ? "seat" : "contact");
  };

  const areaName = (id: string | null) => {
    const a = restaurant.areas.find((x) => x.id === id);
    return a ? (locale === "en" && a.nameEn ? a.nameEn : a.name) : "";
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!party || !date || !slot) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${api}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time: slot.time,
          partySize: party,
          areaId: table ? null : areaId,
          choice: table ? { kind: table.kind, id: table.id } : null,
          guest: { name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes || null },
          locale,
          privacyAcknowledged: contact.privacy,
          website: contact.website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(data.error ?? "generic");
        const key = `widget.error.${code}` as MessageKey;
        const known = ["TABLE_TAKEN", "NO_TABLE", "QUOTA", "TOO_SOON", "RESTAURANT_SUSPENDED", "RATE_LIMIT"].includes(code);
        setError(t(known ? key : "widget.error.generic"));
        if (["TABLE_TAKEN", "NO_TABLE", "QUOTA", "TOO_SOON"].includes(code)) {
          setSlot(null);
          setTable(null);
          void loadAvailability(date, party);
          setStep("time");
        }
        return;
      }
      setResult(data as BookingResult);
      setStep("done");
    } catch {
      setError(t("widget.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("party");
    setParty(null);
    setDate(null);
    setSlot(null);
    setTable(null);
    setAreaId(null);
    setContact(EMPTY_CONTACT);
    setResult(null);
    setError(null);
  };

  const stepTitle: Record<Step, string> = {
    party: t("widget.party.label"),
    date: t("widget.date.label"),
    time: t("widget.time.label"),
    seat: restaurant.allocationMode === "GUEST_CHOOSES_TABLE" ? t("widget.table.label") : t("widget.area.label"),
    contact: t("widget.step.contact"),
    done: result?.status === "REQUESTED" ? t("widget.done.requested") : t("widget.done.confirmed"),
  };

  return (
    <div className={cn("mx-auto w-full max-w-[30rem]", embedded ? "px-4 py-5" : "px-5 py-8 sm:py-12")}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-2xl leading-tight sm:text-[1.75rem]">{restaurant.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("widget.title")}</p>
        </div>
        <button
          type="button"
          onClick={switchLocale}
          lang={locale === "de" ? "en" : "de"}
          className="shrink-0 rounded-sm px-1 py-0.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("widget.language")}
        </button>
      </header>

      {step !== "done" && (party || date || slot) ? (
        <nav aria-label={t("widget.change")} className="mt-6 flex flex-wrap gap-x-1 gap-y-1 border-y py-2 text-sm">
          {party ? (
            <SummaryButton label={t("widget.persons", { count: party })} onClick={() => setStep("party")} />
          ) : null}
          {date ? <SummaryButton label={formatDateShort(date, locale)} onClick={() => setStep("date")} /> : null}
          {slot ? (
            <SummaryButton
              label={locale === "de" ? `${slot.time} Uhr` : slot.time}
              onClick={() => setStep("time")}
            />
          ) : null}
          {slot && (table || areaId) && step === "contact" ? (
            <SummaryButton
              label={table ? `${t("widget.done.table")} ${table.name}` : areaName(areaId)}
              onClick={() => setStep("seat")}
            />
          ) : null}
        </nav>
      ) : null}

      <section className="mt-6" aria-live="polite">
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl outline-none">
          {stepTitle[step]}
        </h2>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {step === "party" ? (
          <PartyStep restaurant={restaurant} selected={party} onSelect={chooseParty} t={t} />
        ) : null}

        {step === "date" && party ? (
          <div className="mt-4 flex justify-center">
            <Calendar
              mode="single"
              locale={locale === "de" ? dayPickerDe : dayPickerEn}
              selected={date ? dateFromKey(date) : undefined}
              onSelect={chooseDate}
              defaultMonth={date ? dateFromKey(date) : dateFromKey(restaurant.today)}
              startMonth={dateFromKey(restaurant.today)}
              endMonth={dateFromKey(addDays(restaurant.today, restaurant.maxAdvanceDays))}
              onMonthChange={(m) => void loadDays(keyFromDate(m), party)}
              disabled={(d) => !availableDays.has(keyFromDate(d))}
              showOutsideDays={false}
              className="rounded-md border bg-card p-3 [--cell-size:--spacing(11)]"
            />
          </div>
        ) : null}

        {step === "time" ? (
          <TimeStep
            availability={availability}
            loading={loading}
            locale={locale}
            selected={slot?.time ?? null}
            onSelect={chooseSlot}
            t={t}
          />
        ) : null}

        {step === "seat" && slot ? (
          <SeatStep
            restaurant={restaurant}
            slot={slot}
            areaId={areaId}
            table={table}
            onArea={setAreaId}
            onTable={setTable}
            onContinue={() => setStep("contact")}
            areaName={areaName}
            t={t}
          />
        ) : null}

        {step === "contact" ? (
          <ContactStep
            restaurant={restaurant}
            locale={locale}
            contact={contact}
            onChange={setContact}
            onSubmit={submit}
            loading={loading}
            t={t}
          />
        ) : null}

        {step === "done" && result && party ? (
          <div className="mt-6 space-y-6">
            <PlaceCard
              locale={locale}
              timeZone={restaurant.timezone}
              restaurantName={restaurant.name}
              guestName={contact.name}
              startsAt={new Date(result.startsAt)}
              partySize={party}
              tableNames={result.tableNames}
              code={result.code}
              pending={result.status === "REQUESTED"}
            />
            <p className="text-center text-sm text-muted-foreground">
              {result.status === "REQUESTED" ? `${t("widget.done.requestedText")} ` : ""}
              {t("widget.done.mail", { email: contact.email })}
            </p>
            <div className="text-center">
              <Button variant="ghost" onClick={reset}>
                {t("widget.done.another")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {restaurant.phone ? (
          <a className="underline-offset-4 hover:underline" href={`tel:${restaurant.phone.replace(/\s/g, "")}`}>
            {restaurant.phone}
          </a>
        ) : (
          <span />
        )}
        {restaurant.showPoweredBy ? <span>{t("widget.poweredBy")}</span> : null}
      </footer>
    </div>
  );
}

function addDays(key: string, days: number) {
  const d = dateFromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function SummaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-2 py-1 text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      {label}
    </button>
  );
}

type T = ReturnType<typeof getTranslator>;

function PartyStep({
  restaurant,
  selected,
  onSelect,
  t,
}: {
  restaurant: WidgetRestaurant;
  selected: number | null;
  onSelect: (n: number) => void;
  t: T;
}) {
  const sizes = Array.from(
    { length: restaurant.maxPartySizeOnline - restaurant.minPartySize + 1 },
    (_, i) => restaurant.minPartySize + i,
  );
  return (
    <div className="mt-4">
      <div role="group" aria-label={t("widget.step.party")} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {sizes.map((n) => (
          <Button
            key={n}
            type="button"
            variant={selected === n ? "default" : "outline"}
            aria-pressed={selected === n}
            onClick={() => onSelect(n)}
            className="tabular h-12 text-base"
          >
            {n}
          </Button>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {restaurant.phone
          ? t("widget.party.more", { max: restaurant.maxPartySizeOnline, phone: restaurant.phone })
          : t("widget.party.moreNoPhone", { max: restaurant.maxPartySizeOnline })}
      </p>
    </div>
  );
}

function TimeStep({
  availability,
  loading,
  locale,
  selected,
  onSelect,
  t,
}: {
  availability: WidgetAvailability | null;
  loading: boolean;
  locale: Locale;
  selected: string | null;
  onSelect: (slot: WidgetSlot) => void;
  t: T;
}) {
  if (loading || !availability) {
    return <p className="mt-4 text-sm text-muted-foreground">{t("widget.time.loading")}</p>;
  }
  if (availability.closed || availability.slots.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {availability.closedReason === "CLOSED" || availability.closedReason === "RUHETAG"
          ? t("widget.date.closed")
          : t("widget.time.none")}
      </p>
    );
  }
  const groups = availability.slots.reduce<Record<string, WidgetSlot[]>>((acc, s) => {
    (acc[s.shift] ??= []).push(s);
    return acc;
  }, {});
  return (
    <div className="mt-4 space-y-5">
      {Object.entries(groups).map(([shift, slots]) => (
        <div key={shift} role="group" aria-label={shift}>
          <p className="mb-2 text-sm text-muted-foreground">{shift}</p>
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <Button
                key={s.time}
                type="button"
                variant={selected === s.time ? "default" : "outline"}
                aria-pressed={selected === s.time}
                onClick={() => onSelect(s)}
                className="tabular h-11"
              >
                {s.time}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        {t("widget.time.duration", { duration: formatDuration(availability.durationMinutes, locale) })}
      </p>
    </div>
  );
}

function SeatStep({
  restaurant,
  slot,
  areaId,
  table,
  onArea,
  onTable,
  onContinue,
  areaName,
  t,
}: {
  restaurant: WidgetRestaurant;
  slot: WidgetSlot;
  areaId: string | null;
  table: WidgetCandidate | null;
  onArea: (id: string | null) => void;
  onTable: (c: WidgetCandidate | null) => void;
  onContinue: () => void;
  areaName: (id: string | null) => string;
  t: T;
}) {
  const groupName = useId();
  const chooseTables = restaurant.allocationMode === "GUEST_CHOOSES_TABLE";
  const areaIds = slot.areaIds;
  const activeArea = areaId ?? (chooseTables ? (areaIds[0] ?? null) : null);
  const tablesInArea = slot.candidates.filter((c) => c.areaId === activeArea);

  return (
    <div className="mt-4 space-y-5">
      {/* Bereichsauswahl */}
      <fieldset>
        <legend className="sr-only">{t("widget.area.label")}</legend>
        <div className="flex flex-wrap gap-2">
          {!chooseTables ? (
            <ChoiceChip name={groupName} checked={areaId === null} onChange={() => onArea(null)} label={t("widget.area.any")} />
          ) : null}
          {areaIds.map((id) => (
            <ChoiceChip
              key={id}
              name={groupName}
              checked={activeArea === id}
              onChange={() => {
                onArea(id);
                onTable(null);
              }}
              label={areaName(id)}
            />
          ))}
        </div>
      </fieldset>

      {chooseTables ? (
        <>
          <ul className="divide-y rounded-md border bg-card" aria-label={t("widget.table.label")}>
            {tablesInArea.map((c) => {
              const selected = table?.id === c.id && table.kind === c.kind;
              return (
                <li key={`${c.kind}-${c.id}`}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onTable(selected ? null : c)}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      selected && "bg-primary/5",
                    )}
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {t("widget.table.seats", { min: c.minCapacity, max: c.maxCapacity })}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "size-4 rounded-full border-2",
                        selected ? "border-primary bg-primary" : "border-input",
                      )}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {table ? (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{t("widget.table.preview")}</p>
              <TableViewPreview media={null} label={`${t("widget.table.preview")} – ${table.name}`} emptyText={t("widget.table.noPreview")} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" onClick={onContinue} className="h-11 sm:flex-1">
          {t("widget.next")}
        </Button>
        {chooseTables && table ? (
          <Button type="button" variant="ghost" onClick={() => onTable(null)} className="h-11">
            {t("widget.table.auto")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ChoiceChip({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
        checked ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}

function ContactStep({
  restaurant,
  locale,
  contact,
  onChange,
  onSubmit,
  loading,
  t,
}: {
  restaurant: WidgetRestaurant;
  locale: Locale;
  contact: Contact;
  onChange: (c: Contact) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  t: T;
}) {
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Contact>(key: K, value: Contact[K]) => onChange({ ...contact, [key]: value });

  const errors = {
    name: contact.name.trim().length < 2 ? t("widget.contact.required") : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim()) ? null : t("widget.contact.invalidEmail"),
    phone: /^[+()0-9\s/-]{6,30}$/.test(contact.phone.trim()) ? null : t("widget.contact.invalidPhone"),
    privacy: contact.privacy ? null : t("widget.contact.privacyRequired"),
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);

  const privacyText =
    (locale === "en" ? restaurant.privacy.en : restaurant.privacy.de) ??
    t("privacy.default", { restaurant: restaurant.name, days: restaurant.privacy.anonymizeAfterDays });

  return (
    <form
      noValidate
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        setTouched(true);
        if (!valid) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
    >
      <Field id="nova-name" label={t("widget.contact.name")} error={show("name")}>
        <Input
          id="nova-name"
          autoComplete="name"
          value={contact.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={!!show("name")}
          aria-describedby={show("name") ? "nova-name-error" : undefined}
          className="h-11"
          required
        />
      </Field>
      <Field id="nova-email" label={t("widget.contact.email")} error={show("email")}>
        <Input
          id="nova-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contact.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={!!show("email")}
          aria-describedby={show("email") ? "nova-email-error" : undefined}
          className="h-11"
          required
        />
      </Field>
      <Field id="nova-phone" label={t("widget.contact.phone")} error={show("phone")}>
        <Input
          id="nova-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contact.phone}
          onChange={(e) => set("phone", e.target.value)}
          aria-invalid={!!show("phone")}
          aria-describedby={show("phone") ? "nova-phone-error" : undefined}
          className="h-11"
          required
        />
      </Field>
      <div className="space-y-1.5">
        <Label htmlFor="nova-notes">{t("widget.contact.notes")}</Label>
        <Textarea
          id="nova-notes"
          value={contact.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={1000}
          rows={3}
          aria-describedby="nova-notes-hint"
        />
        <p id="nova-notes-hint" className="text-xs text-muted-foreground">
          {t("widget.contact.notesHint")}
        </p>
      </div>

      {/* Honeypot: für Menschen unsichtbar, Bots füllen es aus */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={contact.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>

      <div className="space-y-2 rounded-md border bg-card p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            id="nova-privacy"
            checked={contact.privacy}
            onCheckedChange={(v) => set("privacy", v === true)}
            aria-invalid={!!show("privacy")}
            aria-describedby={show("privacy") ? "nova-privacy-error" : undefined}
            className="mt-0.5"
          />
          <Label htmlFor="nova-privacy" className="leading-snug font-normal">
            {t("widget.contact.privacy")}
          </Label>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline-offset-4 hover:underline">{t("widget.contact.privacyLink")}</summary>
          <p className="mt-2 leading-relaxed whitespace-pre-line">{privacyText}</p>
          {restaurant.privacy.policyUrl ? (
            <a href={restaurant.privacy.policyUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">
              {t("privacy.more")}
            </a>
          ) : null}
        </details>
        {show("privacy") ? (
          <p id="nova-privacy-error" className="text-sm text-destructive">
            {show("privacy")}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={loading} className="h-12 w-full text-base">
        {restaurant.confirmationMode === "MANUAL" ? t("widget.contact.submitRequest") : t("widget.contact.submit")}
      </Button>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
