import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-3xl">Kein Zugriff</h1>
      <p className="mt-3 text-muted-foreground">Dieser Bereich ist Inhaberinnen und Inhabern vorbehalten.</p>
      <Link href="/admin" className="mt-6 underline underline-offset-4">Zurück zum Admin-Bereich</Link>
    </main>
  );
}
