"use client"

import { useState, useEffect } from "react"
import { SignUp, useUser } from "@clerk/nextjs"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Building, CreditCard, Smartphone, Search, MapPin, CheckCircle, ArrowRight } from "lucide-react"
import Link from "next/link"
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import StripePaymentForm from '@/components/stripe-payment-form'
import { GoogleAccountLink } from '@/components/google-account-link'

export default function SignUpPage() {
  const { user, isLoaded } = useUser()
  const [step, setStep] = useState(1)
  const [selectedProperty, setSelectedProperty] = useState<any>(null)
  const [propertySearchQuery, setPropertySearchQuery] = useState("")
  const [isSearchingProperty, setIsSearchingProperty] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [nfcCardCount, setNfcCardCount] = useState(2) // Default to 2 included cards
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoadingPayment, setIsLoadingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [stripePromise] = useState(() => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!))
  const [googleAccountData, setGoogleAccountData] = useState<any>(null)

  // Check for URL parameters to pre-select property and handle authentication state
  useEffect(() => {
    if (!isLoaded) return

    const urlParams = new URLSearchParams(window.location.search)
    const stepParam = urlParams.get('step')
    const propertyName = urlParams.get('propertyName')
    const propertyAddress = urlParams.get('propertyAddress')
    const propertyPlaceId = urlParams.get('propertyPlaceId')
    const propertyRating = urlParams.get('propertyRating')

    // If user is authenticated and we have property data, go to step 2
    if (user && propertyName && propertyAddress && propertyPlaceId) {
      setSelectedProperty({
        name: propertyName,
        formatted_address: propertyAddress,
        place_id: propertyPlaceId,
        rating: propertyRating ? parseFloat(propertyRating) : undefined
      })
      setStep(2)
    }
    // If user is authenticated but no property data, stay on step 2
    else if (user && stepParam === '2') {
      setStep(2)
    }
    // If user is not authenticated, stay on step 1
    else if (!user) {
      setStep(1)
    }
  }, [user, isLoaded])

  // Search for properties using Google Places API
  const searchProperties = async () => {
    if (!propertySearchQuery.trim()) return

    setIsSearchingProperty(true)
    setSearchResults([])

    try {
      const response = await fetch(`/api/test-google-places?query=${encodeURIComponent(propertySearchQuery)}`)
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setSearchResults(data.results || [])
    } catch (error) {
      console.error('Error searching properties:', error)
      setPaymentError('Failed to search for properties. Please try again.')
    } finally {
      setIsSearchingProperty(false)
    }
  }

  const selectProperty = (property: any) => {
    setSelectedProperty(property)
    setStep(3) // Move to Google integration step
  }

  const handleGoogleAccountLinked = async (accountData: any) => {
    setGoogleAccountData(accountData)
    
    // Initialize payment after Google account is linked
    setIsLoadingPayment(true)
    setPaymentError(null)
    
    try {
      // Create a payment intent for the trial period
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 0, // $0 for trial
          metadata: {
            nfcCardCount: nfcCardCount.toString(),
            propertyName: selectedProperty.name,
            propertyAddress: selectedProperty.formatted_address,
            propertyPlaceId: selectedProperty.place_id,
            propertyRating: selectedProperty.rating?.toString() || '0',
            trial: 'true',
            googleConnected: 'true',
            googleAccountId: accountData.account?.name || '',
            googleLocationId: accountData.location?.name || ''
          }
        }),
      })
      
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setClientSecret(data.clientSecret)
      setStep(4) // Move to payment step
    } catch (error) {
      console.error('Error creating payment intent:', error)
      setPaymentError('Failed to initialize payment. Please try again.')
    } finally {
      setIsLoadingPayment(false)
    }
  }

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
            
            {/* Logo */}
            <div className="mb-6 flex justify-center">
              <Image
                src="/apt-reputation-logo-full-lg.png"
                alt="APT Reputation"
                width={200}
                height={53}
                className="h-12 w-auto"
                priority
              />
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Your Account</h1>
            <p className="text-gray-600">Join APT Reputation and start managing your property's reputation with AI</p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 1 ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                  {user ? <CheckCircle className="h-4 w-4" /> : '1'}
                </div>
                <span className="ml-2 font-medium">Account</span>
              </div>
              <div className={`w-8 h-0.5 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 2 ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                  2
                </div>
                <span className="ml-2 font-medium">Property</span>
              </div>
              <div className={`w-8 h-0.5 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`flex items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 3 ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                  3
                </div>
                <span className="ml-2 font-medium">Google</span>
              </div>
              <div className={`w-8 h-0.5 ${step >= 4 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
              <div className={`flex items-center ${step >= 4 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= 4 ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                  4
                </div>
                <span className="ml-2 font-medium">Payment</span>
              </div>
            </div>
          </div>

          {/* Step 1: Account Creation */}
          {step === 1 && !user && (
            <div className="max-w-md mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Create Your Account</CardTitle>
                  <CardDescription>
                    Set up your account to start managing your property's reputation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SignUp
                    appearance={{
                      elements: {
                        rootBox: "w-full",
                        card: "shadow-none border-0 p-0",
                      }
                    }}
                    afterSignUpUrl="/dashboard/portfolio"
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Property Selection */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Add Your Property</CardTitle>
                  <CardDescription>
                    Search for your property and we'll set up monitoring for you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Pre-selected Property (if coming from landing page) */}
                  {selectedProperty && (
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="flex items-center mb-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                        <h4 className="font-semibold text-green-800">Property Ready from Landing Page</h4>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-green-700">{selectedProperty.name}</p>
                        <p className="text-sm text-green-600">{selectedProperty.formatted_address}</p>
                        {selectedProperty.rating && (
                          <p className="text-sm text-green-600">Current Rating: ⭐ {selectedProperty.rating}</p>
                        )}
                      </div>
                      <Button 
                        onClick={() => setStep(3)}
                        className="mt-3 bg-green-600 hover:bg-green-700"
                      >
                        Use This Property & Continue
                      </Button>
                    </div>
                  )}

                  {/* Property Search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedProperty ? 'Or search for a different property:' : 'Property Name or Address'}
                    </label>
                    <div className="flex gap-3">
                      <Input
                        placeholder="Enter your property name or address..."
                        value={propertySearchQuery}
                        onChange={(e) => setPropertySearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchProperties()}
                        className="flex-1"
                      />
                      <Button 
                        onClick={searchProperties}
                        disabled={isSearchingProperty || !propertySearchQuery.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 min-w-[120px]"
                      >
                        {isSearchingProperty ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-2" />
                            Search
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Select Your Property:</h4>
                      {searchResults.map((property, index) => (
                        <div 
                          key={index}
                          className="border rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors"
                          onClick={() => selectProperty(property)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="font-semibold text-gray-900">{property.name}</h5>
                              <p className="text-sm text-gray-600 flex items-center mt-1">
                                <MapPin className="h-3 w-3 mr-1" />
                                {property.formatted_address}
                              </p>
                              {property.rating && (
                                <div className="flex items-center mt-2">
                                  <span className="text-sm text-gray-600">
                                    ⭐ {property.rating} ({property.user_ratings_total || 0} reviews)
                                  </span>
                                </div>
                              )}
                            </div>
                            <Button size="sm" variant="outline">
                              Select
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* NFC Cards Selection */}
                  <div className="border-t pt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      NFC Review Cards
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[2, 5, 10].map((count) => (
                        <button
                          key={count}
                          onClick={() => setNfcCardCount(count)}
                          className={`p-4 border rounded-lg text-center transition-colors ${
                            nfcCardCount === count
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <Smartphone className="h-6 w-6 mx-auto mb-2" />
                          <div className="font-medium">{count} Cards</div>
                          <div className="text-sm text-gray-500">
                            {count === 2 ? 'Included' : `+$${(count - 2) * 5}/mo`}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      NFC cards allow residents to easily leave reviews by tapping their phone
                    </p>
                  </div>

                  {/* Plan Summary */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium mb-3">Plan Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Professional Plan</span>
                        <span>$99/month</span>
                      </div>
                      <div className="flex justify-between">
                        <span>NFC Cards ({nfcCardCount})</span>
                        <span>{nfcCardCount === 2 ? 'Included' : `+$${(nfcCardCount - 2) * 5}/mo`}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span>Total</span>
                        <span>${99 + (nfcCardCount > 2 ? (nfcCardCount - 2) * 5 : 0)}/month</span>
                      </div>
                    </div>
                  </div>

                  {/* Continue to Google Integration Button */}
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-4 text-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105" 
                    size="lg"
                    onClick={() => {
                      if (!selectedProperty) {
                        setPaymentError('Please select a property first')
                        return
                      }
                      setStep(3) // Move to Google integration step
                    }}
                    disabled={!selectedProperty}
                  >
                    Continue to Google Integration
                    <ArrowRight className="h-5 w-5 ml-3" />
                  </Button>
                  

                  
                  {paymentError && (
                    <div className="text-red-600 text-sm mt-2">{paymentError}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Google Integration */}
          {step === 3 && selectedProperty && (
            <div className="max-w-2xl mx-auto">
              <GoogleAccountLink
                onAccountLinked={handleGoogleAccountLinked}
                onBack={() => setStep(2)}
                onSkip={async () => {
                  // Skip Google integration and go directly to payment
                  setIsLoadingPayment(true)
                  setPaymentError(null)
                  
                  try {
                    // Create a payment intent for the trial period
                    const response = await fetch('/api/stripe/create-payment-intent', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        amount: 0, // $0 for trial
                        metadata: {
                          nfcCardCount: nfcCardCount.toString(),
                          propertyName: selectedProperty.name,
                          propertyAddress: selectedProperty.formatted_address,
                          propertyPlaceId: selectedProperty.place_id,
                          propertyRating: selectedProperty.rating?.toString() || '0',
                          trial: 'true',
                          googleConnected: 'false'
                        }
                      }),
                    })
                    
                    const data = await response.json()
                    
                    if (data.error) {
                      throw new Error(data.error)
                    }
                    
                    setClientSecret(data.clientSecret)
                    setStep(4)
                  } catch (error) {
                    console.error('Error creating payment intent:', error)
                    setPaymentError('Failed to initialize payment. Please try again.')
                  } finally {
                    setIsLoadingPayment(false)
                  }
                }}
              />
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && selectedProperty && (
            <div className="max-w-md mx-auto">
              {/* Selected Property Summary */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Selected Property</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold">{selectedProperty.name}</h4>
                      <p className="text-sm text-gray-600">{selectedProperty.formatted_address}</p>
                      {selectedProperty.rating && (
                        <p className="text-sm text-gray-600 mt-1">
                          ⭐ {selectedProperty.rating} ({selectedProperty.user_ratings_total || 0} reviews)
                        </p>
                      )}
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Starting Rating:</strong> {selectedProperty.rating || 'N/A'}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        We'll track your progress from this baseline
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isLoadingPayment ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Setting Up Payment...</CardTitle>
                    <CardDescription>
                      Please wait while we prepare your secure payment form
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </CardContent>
                </Card>
              ) : clientSecret ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <StripePaymentForm
                    clientSecret={clientSecret}
                    amount={0} // $0 for trial
                    onSuccess={(paymentIntent) => {
                      console.log('Payment successful:', paymentIntent)
                      // Handle successful payment - redirect to dashboard
                      window.location.href = '/dashboard'
                    }}
                    onError={(error) => {
                      console.error('Payment error:', error)
                      setPaymentError(error)
                    }}
                  />
                </Elements>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Setup Failed</CardTitle>
                    <CardDescription>
                      There was an issue setting up your payment. Please try again.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <Button onClick={() => window.location.reload()}>
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Trial Info */}
              <div className="bg-blue-50 rounded-lg p-4 mt-4">
                <h4 className="font-medium mb-2">Free 14-Day Trial</h4>
                <ul className="text-sm space-y-1">
                  <li>• No charges during trial period</li>
                  <li>• Cancel anytime</li>
                  <li>• Full access to all features</li>
                  <li>• NFC cards shipped after trial</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 