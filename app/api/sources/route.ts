import { currentUser, requireProfessor } from "@/lib/auth";
import { sourceStore } from "@/lib/sources";

export async function GET() {
  const deny = await requireProfessor();
  if (deny) return deny;
  return Response.json({ sources: await sourceStore.list((await currentUser())!.id) });
}
