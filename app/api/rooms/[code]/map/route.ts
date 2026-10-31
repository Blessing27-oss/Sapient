import { currentUser, ownsRoom, requireProfessor } from "@/lib/auth";
import { withDB } from "@/lib/store";
import { cleanSavedTopicMap } from "@/lib/topicMap";

// The room owner edits the lecture map after publishing. Only the map changes: concepts, assessment
// connections, questions and student evidence stay exactly as they are.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const user = await currentUser();
  const { code } = await params;
  const { topicMap } = await req.json();
  const result = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room || !ownsRoom(room, user)) return "missing" as const;
    const cleaned = cleanSavedTopicMap(topicMap, new Set(room.concepts.map((c) => c.id)));
    if (!cleaned) return "invalid" as const;
    room.topicMap = cleaned;
    return "ok" as const;
  });
  if (result === "missing") return Response.json({ error: "Not found" }, { status: 404 });
  if (result === "invalid") return Response.json({ error: "The map needs at least one graph with a box in it." }, { status: 400 });
  return Response.json({ ok: true });
}
