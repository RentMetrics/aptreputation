"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, ExternalLink, Building, MapPin } from "lucide-react"

interface GoogleAccountLinkProps {
  onAccountLinked: (accountData: any) => void
  onBack: () => void
  onSkip?: () => void
}

export function GoogleAccountLink({ onAccountLinked, onBack, onSkip }: GoogleAccountLinkProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<any>(null)
  const [selectedLocation, setSelectedLocation] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Check if user is returning from OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const googleConnected = urlParams.get('google_connected')
    const userEmail = urlParams.get('user_email')
    const error = urlParams.get('error')

    if (error) {
      setError(`Google connection failed: ${error}`)
      return
    }

    if (googleConnected && userEmail) {
      // In production, you'd get the access token from your database
      // For now, we'll simulate this
      setAccessToken('simulated_access_token')
      loadMyBusinessAccounts()
    }
  }, [])

  const connectGoogleAccount = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await fetch('/api/google/auth?redirect_uri=' + encodeURIComponent(window.location.pathname))
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Redirect to Google OAuth
      window.location.href = data.authUrl
    } catch (error) {
      console.error('Error connecting Google account:', error)
      setError('Failed to connect Google account. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  const loadMyBusinessAccounts = async () => {
    if (!accessToken) return

    setIsLoadingAccounts(true)
    setError(null)

    try {
      const response = await fetch(`/api/google/my-business?access_token=${accessToken}`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setAccounts(data.accounts || [])
    } catch (error) {
      console.error('Error loading My Business accounts:', error)
      setError('Failed to load your Google My Business accounts.')
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  const linkProperty = async () => {
    if (!selectedAccount || !selectedLocation) {
      setError('Please select an account and location')
      return
    }

    try {
      const response = await fetch('/api/google/my-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken,
          accountName: selectedAccount.name,
          locationName: selectedLocation.name,
          propertyData: {
            // Add your property data here
          }
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Call the callback with the linked account data
      onAccountLinked({
        account: selectedAccount,
        location: selectedLocation,
        accessToken
      })
    } catch (error) {
      console.error('Error linking property:', error)
      setError('Failed to link property. Please try again.')
    }
  }

  if (accessToken && accounts.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            Google Account Connected
          </CardTitle>
          <CardDescription>
            Select your Google My Business account and location to link with AptReputation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Account Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Your Google My Business Account
            </label>
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.name}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedAccount?.name === account.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => setSelectedAccount(account)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{account.accountName}</h4>
                      <p className="text-sm text-gray-600">{account.type}</p>
                      <p className="text-sm text-gray-500">{account.locations?.length || 0} locations</p>
                    </div>
                    <Badge variant={selectedAccount?.name === account.name ? "default" : "outline"}>
                      {selectedAccount?.name === account.name ? "Selected" : "Select"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Location Selection */}
          {selectedAccount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Your Property Location
              </label>
              <div className="space-y-3">
                {selectedAccount.locations?.map((location: any) => (
                  <div
                    key={location.name}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedLocation?.name === location.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedLocation(location)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-semibold text-gray-900">{location.title}</h5>
                        <p className="text-sm text-gray-600 flex items-center mt-1">
                          <MapPin className="h-3 w-3 mr-1" />
                          {location.address?.formattedAddress}
                        </p>
                        {location.rating && (
                          <div className="flex items-center mt-2">
                            <span className="text-sm text-gray-600">
                              ⭐ {location.rating} ({location.userRatingCount || 0} reviews)
                            </span>
                          </div>
                        )}
                      </div>
                      <Badge variant={selectedLocation?.name === location.name ? "default" : "outline"}>
                        {selectedLocation?.name === location.name ? "Selected" : "Select"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button 
              onClick={linkProperty}
              disabled={!selectedAccount || !selectedLocation}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 text-base font-bold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              Link Property & Continue
            </Button>
          </div>

          {error && (
            <div className="text-red-600 text-sm flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Your Google Account</CardTitle>
        <CardDescription>
          Link your Google My Business account to enable automatic review monitoring and AI responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Benefits */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-blue-800">What this enables:</h4>
          <ul className="space-y-2 text-sm text-blue-700">
            <li className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Real-time review notifications
            </li>
            <li className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Automatic AI-generated responses
            </li>
            <li className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Direct integration with your Google My Business
            </li>
            <li className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-2" />
              Seamless review management
            </li>
          </ul>
        </div>

        {/* Connect Button */}
        <Button 
          onClick={connectGoogleAccount}
          disabled={isConnecting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 text-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          size="lg"
        >
          {isConnecting ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Connecting...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Connect Google My Business
            </div>
          )}
        </Button>

        {/* Skip Option */}
        <div className="text-center">
          {onSkip ? (
            <Button 
              variant="outline" 
              onClick={onSkip}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 text-base font-semibold border-2 border-gray-300 hover:border-gray-400 shadow-md hover:shadow-lg transition-all duration-200"
            >
              Skip for now (manual setup later)
            </Button>
          ) : (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
        </div>

        {error && (
          <div className="text-red-600 text-sm flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
