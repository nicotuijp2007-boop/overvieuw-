import { fetchAll } from "@/lib/runner";

export const dynamic = "force-dynamic";

/** GET /api/usage: fetch every enabled connector now. Handy for scripts or debugging. */
export async function GET() {
  return Response.json(await fetchAll());
}
