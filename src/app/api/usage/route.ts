import { fetchAll } from "@/lib/runner";
import { meter } from "@/lib/metering";

export const dynamic = "force-dynamic";

/** GET /api/usage: fetch every enabled connector now. Handy for scripts or debugging. */
export async function GET() {
  meter("api/usage");
  return Response.json(await fetchAll());
}
