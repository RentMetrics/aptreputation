import { SignIn } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Image src="/apt-reputation-logo-full-lg.png" alt="APT Reputation" width={200} height={53} className="h-12 w-auto" priority />
      </Link>
      <SignIn fallbackRedirectUrl="/dashboard" signUpUrl="/sign-up" />
    </main>
  )
}
