import Image from "next/image"
import Link from "next/link"
import { LEGAL } from "@/lib/legal"

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <Image src="/apt-reputation-logo-full-md.png" alt="APT Reputation" width={160} height={42} className="h-9 w-auto" />
          </Link>
          <nav className="flex gap-4 text-sm text-slate-600" aria-label="Legal">
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-slate-600 mt-2">Effective {LEGAL.effective}</p>
        <div className="mt-8 space-y-8 leading-relaxed text-slate-800 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul+p]:mt-3 [&_a]:text-blue-700 [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200 px-4 py-8 text-sm text-slate-500 text-center">
        {LEGAL.company} · {LEGAL.address}
      </footer>
    </div>
  )
}
