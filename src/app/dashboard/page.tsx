"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Building, 
  TrendingUp, 
  Star, 
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Smartphone,
  Settings,
  Plus,
  Eye
} from "lucide-react"
import Link from "next/link"
import { GoogleIntegrationStatus } from "@/components/google-integration-status"

export default function CustomerDashboard() {
  const [selectedProperty, setSelectedProperty] = useState(0)

  // Mock data - replace with real data from Convex
  const properties = [
    {
      id: 1,
      name: "Sunset Apartments",
      address: "123 Sunset Blvd, Austin, TX",
      reputationScore: 84,
      googleRating: 4.4,
      startingRating: 4.2, // Locked-in starting rating
      totalReviews: 171,
      recentReviews: 12,
      pendingResponses: 3,
      nfcCards: 2, // Updated to reflect new pricing
      lastUpdated: "2 hours ago",
      progress: "+0.2" // Improvement from starting rating
    },
    {
      id: 2,
      name: "Oakwood Properties",
      address: "456 Oak Street, Austin, TX", 
      reputationScore: 72,
      googleRating: 3.8,
      startingRating: 3.8, // Locked-in starting rating
      totalReviews: 203,
      recentReviews: 8,
      pendingResponses: 5,
      nfcCards: 2, // Updated to reflect new pricing
      lastUpdated: "1 day ago",
      progress: "0.0" // No change from starting rating
    }
  ]

  const recentReviews = [
    {
      id: 1,
      author: "Sarah M.",
      rating: 5,
      text: "Great apartment complex! The staff is very friendly and maintenance responds quickly.",
      date: "2 hours ago",
      sentiment: "positive",
      needsResponse: false
    },
    {
      id: 2,
      author: "Mike R.",
      rating: 2,
      text: "The noise from the construction next door is unbearable. Management hasn't addressed this issue.",
      date: "1 day ago",
      sentiment: "negative",
      needsResponse: true
    },
    {
      id: 3,
      author: "Lisa K.",
      rating: 4,
      text: "Nice amenities and clean facilities. Would recommend to friends.",
      date: "2 days ago",
      sentiment: "positive",
      needsResponse: false
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-4">
            <Image
              src="/apt-reputation-logo-full-md.png"
              alt="APT Reputation"
              width={160}
              height={42}
              className="h-10 w-auto"
              priority
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Property Dashboard</h1>
              <p className="text-gray-600">Monitor and manage your property's reputation</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/bulk-upload">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Property
              </Button>
            </Link>
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Property Selection */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Your Properties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {properties.map((property, index) => (
              <Card 
                key={property.id}
                className={`cursor-pointer transition-all ${
                  selectedProperty === index ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedProperty(index)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Building className="h-5 w-5 text-blue-600" />
                    <Badge variant={getScoreBadgeVariant(property.reputationScore)}>
                      {property.reputationScore}/100
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{property.name}</CardTitle>
                  <CardDescription>{property.address}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Current Rating</span>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-400 fill-current mr-1" />
                        <span className="font-medium">{property.googleRating}</span>
                        <span className="text-gray-500 ml-1">({property.totalReviews})</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Starting Rating</span>
                      <span className="font-medium text-gray-500">{property.startingRating}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Progress</span>
                      <span className={`font-medium ${property.progress.startsWith('+') ? 'text-green-600' : property.progress === '0.0' ? 'text-gray-500' : 'text-red-600'}`}>
                        {property.progress}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">NFC Cards</span>
                      <span className="font-medium">{property.nfcCards}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Selected Property Details */}
        {properties[selectedProperty] && (
          <div className="space-y-6">
            {/* Property Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Reputation Score</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getScoreColor(properties[selectedProperty].reputationScore)}`}>
                    {properties[selectedProperty].reputationScore}/100
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +5 points this month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rating Progress</CardTitle>
                  <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">
                    {properties[selectedProperty].googleRating}
                  </div>
                  <p className={`text-xs ${properties[selectedProperty].progress.startsWith('+') ? 'text-green-600' : properties[selectedProperty].progress === '0.0' ? 'text-gray-500' : 'text-red-600'}`}>
                    {properties[selectedProperty].progress} from {properties[selectedProperty].startingRating}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{properties[selectedProperty].totalReviews}</div>
                  <p className="text-xs text-muted-foreground">
                    +{properties[selectedProperty].recentReviews} this month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Responses</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {properties[selectedProperty].pendingResponses}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Need attention
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">NFC Cards</CardTitle>
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{properties[selectedProperty].nfcCards}</div>
                  <p className="text-xs text-muted-foreground">
                    Active cards
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Reviews */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Recent Reviews</CardTitle>
                    <CardDescription>Latest reviews for {properties[selectedProperty].name}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentReviews.map((review) => (
                    <div key={review.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-400 fill-current mr-1" />
                          <span className="font-medium">{review.rating}</span>
                        </div>
                        <Badge variant={review.sentiment === "positive" ? "default" : "destructive"}>
                          {review.sentiment}
                        </Badge>
                        {review.needsResponse && (
                          <Badge variant="destructive">Needs Response</Badge>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{review.author}</span>
                          <span className="text-sm text-gray-500">{review.date}</span>
                        </div>
                        <p className="text-gray-700">{review.text}</p>
                        {review.needsResponse && (
                          <Button size="sm" className="mt-2">
                            Respond
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Google Integration Status */}
            <GoogleIntegrationStatus
              isConnected={true} // This would come from your database
              accountName="Sunset Apartments Management"
              locationName="Sunset Apartments"
              lastSync="2 hours ago"
              onReconnect={() => window.location.href = '/sign-up?step=3'}
              onDisconnect={() => console.log('Disconnect Google account')}
            />

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Review Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" variant="outline">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Respond to Reviews
                  </Button>
                  <Button className="w-full" variant="outline">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    View Analytics
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">NFC Cards</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-gray-600 mb-3">
                    <p>2 cards included in plan</p>
                    <p>Additional cards: $5 each</p>
                  </div>
                  <Button className="w-full" variant="outline">
                    <Smartphone className="h-4 w-4 mr-2" />
                    Manage Cards
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Order More ($5 each)
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Property Settings
                  </Button>
                  <Button className="w-full" variant="outline">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Notification Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 