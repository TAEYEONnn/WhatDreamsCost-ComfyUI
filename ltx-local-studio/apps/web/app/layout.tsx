import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LTX Local Studio",
  description: "Personal AI video production tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen overflow-hidden bg-[#0a0a0a] text-white">
        {children}
      </body>
    </html>
  );
}
