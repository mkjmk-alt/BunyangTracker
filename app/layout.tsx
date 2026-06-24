import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bunyang Tracking Service",
  description: "실시간 민간 분양 정보 및 일정 변경 감지 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground`}>
        <div className="flex min-h-screen flex-col">
          {/* Header */}
          <header className="sticky top-0 z-50 w-full border-b glass">
            <div className="container mx-auto flex h-16 items-center px-4 md:px-6">
              <Link href="/" className="mr-3 sm:mr-6 flex items-center space-x-2 shrink-0">
                <span className="text-base sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
                  BunyangTracker
                </span>
              </Link>
              <nav className="flex items-center justify-end space-x-3 sm:space-x-6 text-xs sm:text-sm font-medium flex-1 overflow-x-auto scrollbar-none whitespace-nowrap py-1">
                <Link href="/projects" className="transition-colors hover:text-primary whitespace-nowrap">분양목록</Link>
                <Link href="/calendar" className="transition-colors hover:text-primary whitespace-nowrap">캘린더</Link>
                <Link href="/changes" className="transition-colors hover:text-primary whitespace-nowrap">변경이력</Link>
                <Link href="/admin/sync" className="transition-colors hover:text-primary whitespace-nowrap">수집관리</Link>
              </nav>
              <div className="flex items-center space-x-4">
                <button className="hidden md:flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90">
                  로그인
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1">
            {children}
          </div>

          {/* Footer */}
          <footer className="border-t py-6 md:py-0">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row px-4">
              <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                Built by Antigravity. © 2024 Bunyang Tracker Inc. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                <Link href="#" className="hover:underline underline-offset-4">Privacy</Link>
                <Link href="#" className="hover:underline underline-offset-4">Terms</Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
