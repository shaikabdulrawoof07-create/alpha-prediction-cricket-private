import LiveCricketDashboard from "@/app/live-cricket-dashboard";
import { fetchLiveMatchesPayload } from "@/lib/live-cricket";
import { getRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

export default async function Home() {
  const origin = await getRequestOrigin();
  const initialData = await fetchLiveMatchesPayload(`${origin}/`);

  return <LiveCricketDashboard initialData={initialData} />;
}
