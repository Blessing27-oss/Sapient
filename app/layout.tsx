import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = { title: "Sapient", description: "Every lecture, mapped. Professors build the map; students find their place on it." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
