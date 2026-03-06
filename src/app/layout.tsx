import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { TRPCProvider } from './providers';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NewsLaw - Next.js tRPC Boilerplate",
  description: "A modern Next.js boilerplate with tRPC, Supabase, and shadcn/ui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCProvider>
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}