import { currentUser } from "@/lib/auth";
import { getRoom } from "@/lib/store";
import { canReadRoomSources, getRoomSources, retrieveSourceChunks } from "@/lib/sources";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const room = await getRoom((await params).code);
  if (!room || !canReadRoomSources(room, user)) return Response.json({ error: "Not found" }, { status: 404 });
  const sources = await getRoomSources(room, user);
  const query = new URL(req.url).searchParams.get("q");
  if (query) return Response.json({ chunks: retrieveSourceChunks(sources, query) });
  return Response.json({ sources: sources.map((s) => ({ id: s.id, filename: s.filename, pageCount: s.pages.length })) });
}
