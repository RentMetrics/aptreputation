"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Navigation } from "@/components/navigation"

export default function TestPage() {
  const [searchQuery, setSearchQuery] = useState("Sunset Apartments Austin TX")
  const [googleResults, setGoogleResults] = useState<any>(null)
  const [geminiResults, setGeminiResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const testGooglePlacesAPI = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/test-google-places?query=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setGoogleResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const testGeminiAPI = async () => {
    if (!googleResults?.results?.[0]) {
      setError('Please test Google Places API first to get a review')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const placeId = googleResults.results[0].place_id
      const reviewsResponse = await fetch(`/api/test-google-reviews?placeId=${placeId}`)
      const reviewsData = await reviewsResponse.json()
      
      if (reviewsData.error) {
        throw new Error(reviewsData.error)
      }

      if (reviewsData.reviews && reviewsData.reviews.length > 0) {
        const review = reviewsData.reviews[0]
        const geminiResponse = await fetch('/api/test-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewText: review.text,
            rating: review.rating
          })
        })
        
        const geminiData = await geminiResponse.json()
        
        if (geminiData.error) {
          throw new Error(geminiData.error)
        }
        
        setGeminiResults(geminiData)
      } else {
        setError('No reviews found for this property')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">API Test Page</h1>
          
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>
                Test your Google Maps and Gemini API integrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Search Query</label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter property search query..."
                />
              </div>
              
              <div className="flex gap-4">
                <Button 
                  onClick={testGooglePlacesAPI} 
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Testing...' : 'Test Google Places API'}
                </Button>
                
                <Button 
                  onClick={testGeminiAPI} 
                  disabled={loading || !googleResults}
                  variant="outline"
                  className="flex-1"
                >
                  {loading ? 'Testing...' : 'Test Gemini API'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-800 font-medium">Error: {error}</p>
              </CardContent>
            </Card>
          )}

          {googleResults && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Google Places API Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(googleResults, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {geminiResults && (
            <Card>
              <CardHeader>
                <CardTitle>Gemini API Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(geminiResults, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
} 