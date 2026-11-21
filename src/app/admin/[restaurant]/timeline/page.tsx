import { redirect } from "next/navigation";

/** Der Tagesplan ist jetzt die Zeitleiste im Tischplan (alte Links und Lesezeichen leiten weiter). */
export default async function TimelineRedirect(props: PageProps<"/admin/[restaurant]/timeline">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const date = typeof sp.date === "string" ? `&date=${encodeURIComponent(sp.date)}` : "";
  redirect(`/admin/${slug}/tischplan?ansicht=zeitleiste${date}`);
}
