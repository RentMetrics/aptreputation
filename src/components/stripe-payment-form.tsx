"use client"

import { useState, useEffect } from 'react'
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface StripePaymentFormProps {
  clientSecret: string
  amount: number
  onSuccess: (paymentIntent: any) => void
  onError: (error: string) => void
}

export default function StripePaymentForm({ 
  clientSecret, 
  amount, 
  onSuccess, 
  onError 
}: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    if (!stripe) {
      return
    }

    if (!clientSecret) {
      return
    }

    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
      switch (paymentIntent?.status) {
        case "succeeded":
          setMessage("Payment succeeded!")
          setIsSuccess(true)
          onSuccess(paymentIntent)
          break
        case "processing":
          setMessage("Your payment is processing.")
          break
        case "requires_payment_method":
          setMessage("Your payment was not successful, please try again.")
          break
        default:
          setMessage("Something went wrong.")
          break
      }
    })
  }, [stripe, clientSecret, onSuccess])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsLoading(true)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/sign-up?step=3&success=true`,
      },
    })

    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        setMessage(error.message || "An error occurred")
        onError(error.message || "Payment failed")
      } else {
        setMessage("An unexpected error occurred.")
        onError("An unexpected error occurred")
      }
    }

    setIsLoading(false)
  }

  const paymentElementOptions = {
    layout: "tabs" as const,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Your Payment</CardTitle>
        <CardDescription>
          Secure payment powered by Stripe
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total Amount:</span>
              <span className="text-lg font-bold">${amount.toFixed(2)}</span>
            </div>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              isSuccess 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {isSuccess ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {message}
            </div>
          )}

          <PaymentElement id="payment-element" options={paymentElementOptions} />

          <Button 
            type="submit" 
            disabled={isLoading || !stripe || !elements || isSuccess}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            ) : isSuccess ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Payment Successful
              </div>
            ) : (
              `Pay $${amount.toFixed(2)}`
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Your payment information is secure and encrypted. We never store your card details.
          </p>
        </form>
      </CardContent>
    </Card>
  )
} 