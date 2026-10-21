import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-3xl">Seite nicht gefunden</h1>
      <p className="mt-3 text-muted-foreground">Die Adresse ist falsch oder die Seite existiert nicht mehr.</p>
      <Link href="/" className="mt-6 underline underline-offset-4">Zur Startseite</Link>
    </main>
  );
}
