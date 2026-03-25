import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const lato = localFont({
  src: "./fonts/Lato-Regular.ttf",
  variable: "--font-lato",
  weight: "400",
  style: "normal",
  display: "swap",
});

const sophiecomic = localFont({
  src: "./fonts/Sophiecomic-Regular.ttf",
  variable: "--font-sophiecomic",
  weight: "400",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Picasso — Visual AI",
  description: "Ask anything. See the answer drawn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${lato.className} ${lato.variable} ${sophiecomic.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
