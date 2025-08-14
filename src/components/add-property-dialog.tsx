"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Search, MapPin, Star, Loader2 } from "lucide-react"

interface PropertySearchResult {
  placeId: string
  name: string
  address: string
  rating: number
  totalReviews: number
  location: {
    lat: number
    lng: number
  }
  types: string[]
}

export function AddPropertyDialog() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<PropertySearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<PropertySearchResult | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const searchProperties = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError(null)
    setSearchResults([])
    setSelectedProperty(null)

    try {
      const response = await fetch(`/api/test-google-places?query=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setSearchResults(data.results || [])
      }
    } catch (error) {
      setError("Failed to search for properties")
    } finally {
      setLoading(false)
    }
  }

  const handleAddProperty = async () => {
    if (!selectedProperty) return

    setIsAdding(true)
    try {
      // Here you would typically call your Convex mutation to add the property
      // For now, we'll just simulate the process
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Reset the form
      setSearchQuery("")
      setSearchResults([])
      setSelectedProperty(null)
      setError(null)
      
      // Close the dialog (you might need to handle this differently)
      window.location.reload() // Simple refresh for now
    } catch (error) {
      setError("Failed to add property")
    } finally {
      setIsAdding(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchProperties()
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Property
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Property</DialogTitle>
          <DialogDescription>
            Search for a property by name or address to add it to your dashboard.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search for property name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={searchProperties} 
              disabled={loading || !searchQuery.trim()}
              size="sm"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-sm text-gray-700">
                Search Results ({searchResults.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {searchResults.map((property) => (
                  <Card 
                    key={property.placeId}
                    className={`cursor-pointer transition-all ${
                      selectedProperty?.placeId === property.placeId 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => setSelectedProperty(property)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">{property.name}</CardTitle>
                          <CardDescription className="flex items-center mt-1">
                            <MapPin className="h-3 w-3 mr-1" />
                            {property.address}
                          </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                          {property.rating && (
                            <div className="flex items-center">
                              <Star className="h-3 w-3 text-yellow-400 fill-current mr-1" />
                              <span className="text-sm font-medium">{property.rating}</span>
                              <span className="text-xs text-gray-500 ml-1">
                                ({property.totalReviews})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1">
                        {property.types.slice(0, 3).map((type, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {type.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {searchResults.length === 0 && !loading && searchQuery && !error && (
            <div className="text-center py-8 text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No properties found. Try a different search term.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            onClick={handleAddProperty}
            disabled={!selectedProperty || isAdding}
            className="w-full sm:w-auto"
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding Property...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Property
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
