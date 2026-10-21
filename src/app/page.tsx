import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Schlanke Startseite. Die eigentliche Produktseite liegt außerhalb dieser App. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-between px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="font-serif text-lg">A&amp;E NOVA Reservierungen</span>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/login">Anmelden</Link>
        </Button>
      </header>
      <section className="py-16">
        <h1 className="max-w-xl font-serif text-4xl leading-tight sm:text-5xl">
          Tischreservierungen, die zu Ihrem Haus passen.
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          Online-Buchung auf Ihrer Website, Tischplan und Tagesübersicht für den Service – gehostet in der EU, ohne
          Tracking.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 px-5">
            <Link href="/r/pastahaus">Demo-Widget ansehen</Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-11 px-5">
            <Link href="/admin/login">Zum Admin-Bereich</Link>
          </Button>
        </div>
      </section>
      <footer className="text-sm text-muted-foreground">© A&amp;E NOVA</footer>
    </main>
  );
}
