import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import AuthGuard from "@/components/layout/AuthGuard";
import LayoutShell from "@/components/layout/LayoutShell";

export const metadata: Metadata = {
  title: "Samhwa Flow",
  description: "수수료 통합관리",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full">
        <AuthGuard>
          <LayoutShell>{children}</LayoutShell>
        </AuthGuard>
      </body>
    </html>
  );
}
