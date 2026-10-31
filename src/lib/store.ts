import type { CourseMaterial, PublicQuestion, Question, Room } from "./types";

// In-memory store for the local demo. Kept on globalThis so dev-server hot reloads keep rooms.
const g = globalThis as unknown as { __sapientRooms?: Map<string, Room> };
const rooms = (g.__sapientRooms ??= new Map<string, Room>());

export const QUESTION_BUDGET = 3;

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function newCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(material: CourseMaterial): Room {
  const room: Room = {
    ...structuredClone(material),
    code: newCode(),
    createdAt: Date.now(),
    budget: QUESTION_BUDGET,
    students: [],
    responses: [],
    challenges: [],
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function publicQuestion(q: Question): PublicQuestion {
  return { id: q.id, text: q.text, options: q.options, conceptIds: q.conceptIds, sourcePage: q.sourcePage };
}
