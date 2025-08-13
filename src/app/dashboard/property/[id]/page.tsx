"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  ArrowLeft,
  Star, 
  TrendingUp, 
  MessageSquare, 
  ThumbsUp,
  ThumbsDown,
  Clock,
  Filter,
  Search,
  Send,
  Edit,
  Check,
  X
} from "lucide-react"

export default function PropertyDetail({ params }: { params: { id: string } }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [editingResponse, setEditingResponse] = useState<string | null>(null)
  const [responseText, setResponseText] = useState("")
  
  // Mock data - in real implementation this would come from the database
  const property = {
    id: params.id,
    name: "Sunset Apartments",
    address: "123 Main St, Austin, TX",
    googleRating: 4.3,
    totalReviews: 156,
    aptReputationScore: 82,
    trend: "up",
    recentReviews: 8,
    pendingResponses: 2
  }

  const reviews = [
    {
      id: 1,
      reviewer: "Sarah Johnson",
      rating: 5,
      date: "2024-01-15",
      text: "Absolutely love living here! The staff is incredibly friendly and responsive. The amenities are top-notch and the location is perfect. Maintenance requests are handled quickly and professionally.",
      sentiment: "positive",
      themes: ["Staff Friendliness", "Amenities", "Maintenance"],
      needsResponse: false,
      aiResponse: null
    },
    {
      id: 2,
      reviewer: "Mike Chen",
      rating: 3,
      date: "2024-01-14",
      text: "The apartment itself is nice, but the parking situation is terrible. There's never enough parking spaces and I often have to park on the street. Also, the walls are quite thin so you can hear neighbors easily.",
      sentiment: "negative",
      themes: ["Parking", "Noise"],
      needsResponse: true,
      aiResponse: "Dear Mike, thank you for your feedback. We sincerely apologize for the parking challenges you've experienced. This is an issue we're actively working to address. We're exploring additional parking solutions and have recently implemented a parking management system to better allocate spaces. Regarding noise concerns, we're in the process of upgrading soundproofing in common areas. Please contact our office directly so we can discuss these issues further and ensure your concerns are fully addressed."
    },
    {
      id: 3,
      reviewer: "Emily Rodriguez",
      rating: 4,
      date: "2024-01-13",
      text: "Great location and the leasing process was smooth. The apartment is clean and well-maintained. Only minor issue is that the gym equipment could use some updates.",
      sentiment: "positive",
      themes: ["Location", "Leasing Process", "Cleanliness", "Amenities"],
      needsResponse: false,
      aiResponse: null
    },
    {
      id: 4,
      reviewer: "David Kim",
      rating: 2,
      date: "2024-01-12",
      text: "Very disappointed with the maintenance service. I reported a leak in my bathroom over a week ago and it still hasn't been fixed. The office staff keeps saying they'll get to it but nothing happens.",
      sentiment: "negative",
      themes: ["Maintenance", "Communication"],
      needsResponse: true,
      aiResponse: "Dear David, we sincerely apologize for the delay in addressing your bathroom leak. This is not the standard of service we aim to provide. I've escalated this issue to our maintenance supervisor and it will be resolved today. Please accept our apologies for the inconvenience and know that we're reviewing our internal processes to prevent this from happening again. If you need immediate assistance, please call our emergency maintenance line."
    }
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default"
    if (score >= 60) return "secondary"
    return "destructive"
  }

  const getSentimentBadgeVariant = (sentiment: string) => {
    if (sentiment === "positive") return "default"
    if (sentiment === "neutral") return "secondary"
    return "destructive"
  }

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
      />
    ))
  }

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = review.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         review.reviewer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = selectedFilter === "all" || 
                         (selectedFilter === "needs-response" && review.needsResponse) ||
                         (selectedFilter === "positive" && review.sentiment === "positive") ||
                         (selectedFilter === "negative" && review.sentiment === "negative")
    return matchesSearch && matchesFilter
  })

  const handleEditResponse = (reviewId: string, currentResponse: string) => {
    setEditingResponse(reviewId)
    setResponseText(currentResponse)
  }

  const handleSaveResponse = () => {
    // In real implementation, this would save to the database
    setEditingResponse(null)
    setResponseText("")
  }

  const handleSendResponse = (reviewId: string) => {
    // In real implementation, this would post to Google
    console.log("Sending response for review:", reviewId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Button variant="ghost" className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
              <p className="text-gray-600">{property.address}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Property Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Google Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{property.googleRating}</div>
              <p className="text-xs text-muted-foreground">
                {property.totalReviews} total reviews
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AptReputation Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(property.aptReputationScore)}`}>
                {property.aptReputationScore}
              </div>
              <Badge variant={getScoreBadgeVariant(property.aptReputationScore)} className="text-xs">
                {property.trend === 'up' ? 'Improving' : 'Declining'}
              </Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Reviews</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{property.recentReviews}</div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Responses</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{property.pendingResponses}</div>
              <p className="text-xs text-muted-foreground">
                Need attention
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search reviews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant={selectedFilter === "all" ? "default" : "outline"}
              onClick={() => setSelectedFilter("all")}
            >
              All
            </Button>
            <Button 
              variant={selectedFilter === "needs-response" ? "default" : "outline"}
              onClick={() => setSelectedFilter("needs-response")}
            >
              Needs Response
            </Button>
            <Button 
              variant={selectedFilter === "positive" ? "default" : "outline"}
              onClick={() => setSelectedFilter("positive")}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Positive
            </Button>
            <Button 
              variant={selectedFilter === "negative" ? "default" : "outline"}
              onClick={() => setSelectedFilter("negative")}
            >
              <ThumbsDown className="h-4 w-4 mr-2" />
              Negative
            </Button>
          </div>
        </div>

        {/* Reviews List */}
        <div className="space-y-6">
          {filteredReviews.map((review) => (
            <Card key={review.id} className={review.needsResponse ? "border-orange-200 bg-orange-50" : ""}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{review.reviewer}</h3>
                      <Badge variant={getSentimentBadgeVariant(review.sentiment)}>
                        {review.sentiment}
                      </Badge>
                      {review.needsResponse && (
                        <Badge variant="destructive">Needs Response</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex">
                        {getRatingStars(review.rating)}
                      </div>
                      <span className="text-sm text-gray-500">{review.date}</span>
                    </div>
                    <div className="flex gap-2">
                      {review.themes.map((theme, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">{review.text}</p>
                
                {review.aiResponse && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-blue-900">AI-Generated Response</h4>
                      <div className="flex gap-2">
                        {editingResponse === review.id.toString() ? (
                          <>
                            <Button size="sm" onClick={handleSaveResponse}>
                              <Check className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingResponse(null)}>
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleEditResponse(review.id.toString(), review.aiResponse || "")}>
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button size="sm" onClick={() => handleSendResponse(review.id.toString())}>
                              <Send className="h-4 w-4 mr-1" />
                              Send
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingResponse === review.id.toString() ? (
                      <textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        className="w-full p-3 border border-blue-300 rounded-lg resize-none"
                        rows={4}
                      />
                    ) : (
                      <p className="text-blue-800">{review.aiResponse}</p>
                    )}
                  </div>
                )}
                
                {review.needsResponse && !review.aiResponse && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-900 mb-2">Generate AI Response</h4>
                    <p className="text-orange-800 mb-3">
                      This review needs a response. Click below to generate an AI-powered response.
                    </p>
                    <Button size="sm">
                      <Send className="h-4 w-4 mr-2" />
                      Generate Response
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredReviews.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews found</h3>
            <p className="text-gray-600">
              {searchQuery ? "Try adjusting your search terms" : "No reviews match the current filters"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
} 