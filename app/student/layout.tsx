import { Newsreader } from "next/font/google";
import "./student.css";

// Editorial serif for the student journey only; the rest of the app keeps its own type.
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-journal", display: "swap" });

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${newsreader.variable} student-journal`}>{children}</div>;
}
