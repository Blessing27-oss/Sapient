import { PROFESSOR_EMAIL, devLoginAllowed, googleClientId, isProfessor } from "@/lib/auth";

export async function GET() {
  return Response.json({ professor: await isProfessor(), email: PROFESSOR_EMAIL, googleClientId: googleClientId(), dev: devLoginAllowed() });
}
