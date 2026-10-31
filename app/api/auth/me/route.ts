import { isProfessor } from "@/lib/auth";

export async function GET() {
  return Response.json({ professor: await isProfessor() });
}
