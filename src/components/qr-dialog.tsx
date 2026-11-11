"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/** Shows a printable QR code for a tap URL. */
export function QrDialog({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (open) void QRCode.toDataURL(url, { width: 640, margin: 2 }).then(setSrc)
  }, [open, url])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><QrCode className="h-4 w-4 mr-1.5" />QR code</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-all">{url}</DialogDescription>
        </DialogHeader>
        {src && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`QR code for ${title}`} className="w-full rounded-lg border" />
            <a href={src} download={`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`} className="text-sm font-medium text-blue-700 underline text-center">
              Download PNG for printing
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
