"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTranslator, type Locale, type MessageKey } from "@/i18n/messages";
import { cancelByGuestAction, modifyByGuestAction } from "./actions";

interface Current {
  date: string;
  time: string;
  partySize: number;
}

export function ManageActions({
  token,
  slug,
  locale,
  current,
  maxPartySize,
  today,
  canModify,
}: {
  token: string;
  slug: string;
  locale: Locale;
  current: Current;
  maxPartySize: number;
  today: string;
  canModify: boolean;
}) {
  const t = getTranslator(locale);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Current>(current);
  const [times, setTimes] = useState<string[] | null>(null);

  const errorText = (code: string) => {
    const known = ["TABLE_TAKEN", "NO_TABLE", "QUOTA", "TOO_SOON"];
    return t((known.includes(code) ? `widget.error.${code}` : "widget.error.generic") as MessageKey);
  };

  const loadTimes = async (date: string, partySize: number) => {
    setTimes(null);
    const res = await fetch(`/api/public/${encodeURIComponent(slug)}/availability?date=${date}&party=${partySize}`);
    if (!res.ok) return setTimes([]);
    const data: { slots: { time: string }[] } = await res.json();
    setTimes(data.slots.map((s) => s.time));
  };

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelByGuestAction(token);
      setMessage(result.ok ? { kind: "ok", text: t("manage.cancelled") } : { kind: "error", text: errorText(result.code) });
    });

  const save = () =>
    startTransition(async () => {
      const result = await modifyByGuestAction(token, form);
      if (result.ok) {
        setEditing(false);
        setMessage({ kind: "ok", text: t("manage.modified") });
      } else {
        setMessage({ kind: "error", text: errorText(result.code) });
      }
    });

  return (
    <div className="mt-8 space-y-4">
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              : "rounded-md border bg-card px-3 py-2 text-sm"
          }
        >
          {message.text}
        </p>
      ) : null}

      {editing ? (
        <fieldset className="space-y-4 rounded-md border bg-card p-4" disabled={pending}>
          <legend className="px-1 text-sm font-medium">{t("manage.modify")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-date">{t("widget.step.date")}</Label>
              <Input
                id="m-date"
                type="date"
                min={today}
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value, time: "" });
                  if (e.target.value) void loadTimes(e.target.value, form.partySize);
                }}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-party">{t("widget.step.party")}</Label>
              <select
                id="m-party"
                value={form.partySize}
                onChange={(e) => {
                  const partySize = Number(e.target.value);
                  setForm({ ...form, partySize, time: "" });
                  void loadTimes(form.date, partySize);
                }}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Array.from({ length: maxPartySize }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-time">{t("widget.step.time")}</Label>
            <select
              id="m-time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{times === null ? t("widget.time.loading") : "–"}</option>
              {(times ?? []).map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
            {times !== null && times.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("widget.time.none")}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={!form.time || pending} className="h-11 flex-1">
              {t("manage.modifySave")}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} className="h-11">
              {t("widget.back")}
            </Button>
          </div>
        </fieldset>
      ) : message?.kind === "ok" && message.text === t("manage.cancelled") ? null : (
        <div className="flex flex-col gap-2">
          {canModify ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setEditing(true);
                setMessage(null);
                void loadTimes(form.date, form.partySize);
              }}
            >
              {t("manage.modify")}
            </Button>
          ) : null}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" className="h-11 text-destructive hover:text-destructive">
                {t("manage.cancel")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{t("manage.cancel")}</DialogTitle>
              <DialogDescription>{t("manage.cancelConfirm")}</DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("manage.cancelNo")}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={cancel} disabled={pending}>
                    {t("manage.cancelYes")}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
