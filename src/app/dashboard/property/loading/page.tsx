"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, MapPin, ArrowRight } from "lucide-react"
import Link from "next/link"

export default function PropertyLoadingPage() {
  const [propertySearchQuery, setPropertySearchQuery] = useState("")
  const [isSearchingProperty, setIsSearchingProperty] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])

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
    } finally {
      setIsSearchingProperty(false)
    }
  }

  const selectProperty = (property: any) => {
    // Redirect to signup with property pre-selected
    const params = new URLSearchParams({
      step: '2',
      propertyName: property.name,
      propertyAddress: property.formatted_address,
      propertyPlaceId: property.place_id,
      propertyRating: property.rating?.toString() || '0'
    })
    window.location.href = `/sign-up?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
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
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Your Property</h1>
            <p className="text-gray-600">Let's get started by adding your first property to monitor</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Find Your Property</CardTitle>
              <CardDescription>
                Search for your property by name or address. We'll set up monitoring and track your reputation progress from today.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Property Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Property Name or Address
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
                  >
                    {isSearchingProperty ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Search className="h-4 w-4" />
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

              {/* Info Section */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2 text-blue-800">What happens next?</h4>
                <ul className="space-y-2 text-sm text-blue-700">
                  <li>• We'll lock in your current rating as the starting point</li>
                  <li>• Set up real-time monitoring of new reviews</li>
                  <li>• Configure your NFC review cards</li>
                  <li>• Start tracking your reputation progress</li>
                </ul>
              </div>

              {/* Back to Dashboard */}
              <div className="text-center pt-4 border-t">
                <Link href="/dashboard">
                  <Button variant="outline">
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
