"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Navigation } from "@/components/navigation"

export default function TestSearchPage() {
  const [searchQuery, setSearchQuery] = useState("Sunset Apartments Austin TX")
  const [placesResults, setPlacesResults] = useState<any>(null)
  const [reviewsResults, setReviewsResults] = useState<any>(null)
  const [geminiResults, setGeminiResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const testGooglePlacesAPI = async () => {
    setLoading(true)
    setError(null)
    setPlacesResults(null)
    
    try {
      const response = await fetch(`/api/test-google-places?query=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setPlacesResults(data)
      }
    } catch (error) {
      setError("Failed to test Google Places API")
    } finally {
      setLoading(false)
    }
  }

  const testGoogleReviewsAPI = async (placeId: string) => {
    setLoading(true)
    setError(null)
    setReviewsResults(null)
    
    try {
      const response = await fetch(`/api/test-google-reviews?placeId=${placeId}`)
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setReviewsResults(data)
      }
    } catch (error) {
      setError("Failed to test Google Reviews API")
    } finally {
      setLoading(false)
    }
  }

  const testGeminiAPI = async (reviewText: string, rating: number) => {
    setLoading(true)
    setError(null)
    setGeminiResults(null)
    
    try {
      const response = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewText,
          rating
        }),
      })
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setGeminiResults(data)
      }
    } catch (error) {
      setError("Failed to test Gemini API")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto py-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">API Test Page</h1>
          <p className="text-gray-600 mb-6">Test the Google Places, Reviews, and Gemini APIs</p>
        </div>

        {/* Search Input */}
        <Card>
          <CardHeader>
            <CardTitle>Property Search</CardTitle>
            <CardDescription>Enter a property name or address to search</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter property name or address..."
                className="flex-1"
              />
              <Button onClick={testGooglePlacesAPI} disabled={loading}>
                {loading ? "Testing..." : "Search Places"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-red-600">
                <strong>Error:</strong> {error}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Places Results */}
        {placesResults && (
          <Card>
            <CardHeader>
              <CardTitle>Google Places Results</CardTitle>
              <CardDescription>Found {placesResults.results?.length || 0} properties</CardDescription>
            </CardHeader>
            <CardContent>
              {placesResults.results?.map((place: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-lg">{place.name}</h3>
                  <p className="text-gray-600 mb-2">{place.formatted_address}</p>
                  <div className="flex items-center gap-4 mb-3">
                    <Badge variant="outline">
                      ⭐ {place.rating} ({place.user_ratings_total} reviews)
                    </Badge>
                    <Badge variant="secondary">
                      Place ID: {place.place_id.slice(0, 20)}...
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => testGoogleReviewsAPI(place.place_id)}
                      disabled={loading}
                    >
                      Get Reviews
                    </Button>
                    {place.place_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testGeminiAPI("Great apartment with friendly staff", 5)}
                        disabled={loading}
                      >
                        Test Gemini
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Google Reviews Results */}
        {reviewsResults && (
          <Card>
            <CardHeader>
              <CardTitle>Google Reviews Results</CardTitle>
              <CardDescription>
                Rating: {reviewsResults.rating} ⭐ ({reviewsResults.totalReviews} total reviews)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reviewsResults.reviews?.slice(0, 3).map((review: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold">{review.author_name}</span>
                      <Badge variant="outline">⭐ {review.rating}</Badge>
                      <span className="text-sm text-gray-500">{review.relative_time_description}</span>
                    </div>
                    <p className="text-gray-700 mb-2">{review.text}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testGeminiAPI(review.text, review.rating)}
                      disabled={loading}
                    >
                      Analyze with Gemini
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gemini Results */}
        {geminiResults && (
          <Card>
            <CardHeader>
              <CardTitle>Gemini Analysis Results</CardTitle>
              <CardDescription>AI-powered review analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={geminiResults.sentiment === 'positive' ? 'default' : geminiResults.sentiment === 'negative' ? 'destructive' : 'secondary'}>
                    {geminiResults.sentiment}
                  </Badge>
                  <Badge variant={geminiResults.needsResponse ? 'destructive' : 'outline'}>
                    {geminiResults.needsResponse ? 'Needs Response' : 'No Response Needed'}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Themes:</h4>
                  <div className="flex flex-wrap gap-2">
                    {geminiResults.themes?.map((theme: string, index: number) => (
                      <Badge key={index} variant="outline">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Reasoning:</h4>
                  <p className="text-gray-700">{geminiResults.reasoning}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
} 