import { SignUp } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Image src="/aptreputation-logo-lg.png" alt="AptReputation" width={795} height={240} className="h-16 w-auto" priority />
      </Link>
      <p className="text-slate-600 text-center max-w-sm">
        14-day free trial. No card needed to start.
      </p>
      <SignUp fallbackRedirectUrl="/dashboard" signInUrl="/sign-in" />
      <p className="text-sm text-slate-500 text-center max-w-sm">
        By creating an account you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </main>
  )
}
