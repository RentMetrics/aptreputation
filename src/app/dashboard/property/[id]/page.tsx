"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Building,
  TrendingUp,
  TrendingDown,
  Star,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Smartphone,
  Settings,
  Eye,
  Calendar,
  Lightbulb,
  Target,
  BarChart3,
  Users,
  Wrench,
  Home,
  ShieldAlert
} from "lucide-react"
import { GoogleIntegrationStatus } from "@/components/google-integration-status"

export default function PropertyDashboard() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.id

  // Mock data - replace with real data from Convex based on propertyId
  const property = {
    id: propertyId,
    name: "Sunset Apartments",
    address: "123 Sunset Blvd, Austin, TX",
    reputationScore: 84,
    googleRating: 4.4,
    baselineRating: 4.2,
    totalReviews: 171,
    recentReviews: 12,
    pendingResponses: 3,
    nfcCards: 2,
    signupDate: "2024-07-08",
    monthsSinceSignup: 3,
    improvement: "+0.2",
    improvementPercent: "+4.8%",
    trending: "up"
  }

  // AI-Generated Improvement Strategies based on review analysis
  const improvementStrategies = {
    summary: "Based on analysis of 171 reviews, we've identified key opportunities to improve your property's reputation and increase your rating to 4.7+ stars.",
    keyFindings: [
      {
        category: "Maintenance Response Time",
        sentiment: "negative",
        frequency: "high",
        impact: "High Impact",
        finding: "28% of reviews mention slow maintenance response times, particularly for AC and plumbing issues.",
        recommendation: "Implement a 24-hour response guarantee for urgent maintenance requests and communicate response times clearly to residents."
      },
      {
        category: "Staff Friendliness",
        sentiment: "positive",
        frequency: "high",
        impact: "Strength",
        finding: "45% of positive reviews specifically praise the front desk staff and leasing team's friendliness.",
        recommendation: "Leverage this strength in marketing materials and ensure staff training maintains this high standard."
      },
      {
        category: "Amenities & Facilities",
        sentiment: "mixed",
        frequency: "medium",
        impact: "Medium Impact",
        finding: "Pool and gym facilities receive mixed feedback - 18% mention cleanliness issues during peak hours.",
        recommendation: "Increase cleaning frequency during peak times (6-9 PM) and add visible cleaning schedules in amenity areas."
      },
      {
        category: "Noise Levels",
        sentiment: "negative",
        frequency: "medium",
        impact: "Medium Impact",
        finding: "15% of reviews mention noise from neighboring units or common areas.",
        recommendation: "Review soundproofing between units, establish and enforce quiet hours, and provide noise complaints resolution process."
      },
      {
        category: "Value for Money",
        sentiment: "positive",
        frequency: "high",
        impact: "Strength",
        finding: "52% of reviews mention good value for the location and amenities provided.",
        recommendation: "Highlight this in marketing and consider slight rent increases for new leases to match market value."
      }
    ],
    actionPlan: [
      {
        priority: "Immediate",
        action: "Implement 24-hour maintenance response guarantee",
        expectedImpact: "+0.2 stars within 2 months",
        effort: "Medium"
      },
      {
        priority: "Immediate",
        action: "Increase amenity cleaning during peak hours",
        expectedImpact: "+0.1 stars within 1 month",
        effort: "Low"
      },
      {
        priority: "Short-term",
        action: "Establish formal quiet hours policy with resident communication",
        expectedImpact: "+0.1 stars within 3 months",
        effort: "Low"
      },
      {
        priority: "Ongoing",
        action: "Continue staff training and recognition programs",
        expectedImpact: "Maintain current strength",
        effort: "Low"
      }
    ]
  }

  const recentReviews = [
    {
      id: 1,
      author: "Sarah M.",
      rating: 5,
      text: "Great apartment complex! The staff is very friendly and maintenance responds quickly.",
      date: "2 hours ago",
      sentiment: "positive",
      themes: ["Staff Friendliness", "Maintenance Response"],
      needsResponse: false
    },
    {
      id: 2,
      author: "Mike R.",
      rating: 2,
      text: "The noise from the construction next door is unbearable. Management hasn't addressed this issue.",
      date: "1 day ago",
      sentiment: "negative",
      themes: ["Noise Levels", "Management Response"],
      needsResponse: true
    },
    {
      id: 3,
      author: "Lisa K.",
      rating: 4,
      text: "Nice amenities and clean facilities. Would recommend to friends.",
      date: "2 days ago",
      sentiment: "positive",
      themes: ["Amenities", "Cleanliness"],
      needsResponse: false
    }
  ]

  // Rating progression data
  const ratingHistory = [
    { month: "Jul", rating: 4.2, reviews: 159 },
    { month: "Aug", rating: 4.3, reviews: 163 },
    { month: "Sep", rating: 4.4, reviews: 171 }
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getImpactColor = (impact: string) => {
    if (impact === "High Impact" || impact === "Immediate") return "destructive"
    if (impact === "Medium Impact" || impact === "Short-term") return "secondary"
    return "default"
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard/portfolio')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portfolio
          </Button>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center space-x-4">
              <Building className="h-12 w-12 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{property.name}</h1>
                <p className="text-gray-600">{property.address}</p>
              </div>
            </div>
            <Button>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reputation Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getScoreColor(property.reputationScore)}`}>
                {property.reputationScore}/100
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
              <div className="text-3xl font-bold text-gray-900">
                {property.googleRating}
              </div>
              <p className={`text-xs font-medium ${
                property.improvement.startsWith('+') ? 'text-green-600' : 'text-gray-500'
              }`}>
                {property.improvement} from baseline ({property.baselineRating})
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{property.totalReviews}</div>
              <p className="text-xs text-muted-foreground">
                +{property.recentReviews} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tracking Since</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{property.monthsSinceSignup}</div>
              <p className="text-xs text-muted-foreground">
                months of data
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Rating History Chart */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Rating Performance Over Time</CardTitle>
            <CardDescription>Baseline: {property.baselineRating} ⭐ (locked at signup on {property.signupDate})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between h-48 gap-4">
              {ratingHistory.map((data, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg relative"
                       style={{ height: `${(data.rating / 5) * 100}%` }}>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 font-bold text-lg">
                      {data.rating}
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium">{data.month}</div>
                  <div className="text-xs text-gray-500">{data.reviews} reviews</div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <p className="text-sm font-medium text-gray-900">
                  Your rating has improved by {property.improvement} stars ({property.improvementPercent}) since signing up!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI-Powered Improvement Strategies */}
        <Card className="mb-8 border-2 border-purple-200">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Lightbulb className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">AI-Powered Improvement Strategies</CardTitle>
                <CardDescription className="text-base">{improvementStrategies.summary}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Key Findings */}
            <div className="mb-8">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Key Findings from Review Analysis
              </h3>
              <div className="space-y-4">
                {improvementStrategies.keyFindings.map((finding, index) => (
                  <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {finding.category === "Maintenance Response Time" && <Wrench className="h-5 w-5 text-orange-600" />}
                        {finding.category === "Staff Friendliness" && <Users className="h-5 w-5 text-green-600" />}
                        {finding.category === "Amenities & Facilities" && <Home className="h-5 w-5 text-blue-600" />}
                        {finding.category === "Noise Levels" && <ShieldAlert className="h-5 w-5 text-red-600" />}
                        {finding.category === "Value for Money" && <BarChart3 className="h-5 w-5 text-purple-600" />}
                        <h4 className="font-bold text-gray-900">{finding.category}</h4>
                      </div>
                      <Badge variant={getImpactColor(finding.impact)}>{finding.impact}</Badge>
                    </div>
                    <p className="text-sm text-gray-700 mb-3">{finding.finding}</p>
                    <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded">
                      <p className="text-sm font-medium text-green-900">
                        <strong>Recommendation:</strong> {finding.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Plan */}
            <div>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Prioritized Action Plan
              </h3>
              <div className="space-y-3">
                {improvementStrategies.actionPlan.map((action, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Badge variant={getImpactColor(action.priority)} className="mt-1">
                      {action.priority}
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 mb-1">{action.action}</p>
                      <div className="flex gap-4 text-sm text-gray-600">
                        <span>📈 Impact: {action.expectedImpact}</span>
                        <span>⚡ Effort: {action.effort}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Reviews */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Recent Reviews</CardTitle>
                <CardDescription>Latest reviews for {property.name}</CardDescription>
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
                    <p className="text-gray-700 mb-2">{review.text}</p>
                    <div className="flex gap-2">
                      {review.themes.map((theme, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{theme}</Badge>
                      ))}
                    </div>
                    {review.needsResponse && (
                      <Button size="sm" className="mt-3">
                        Generate AI Response
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
          isConnected={true}
          accountName="Sunset Apartments Management"
          locationName="Sunset Apartments"
          lastSync="2 hours ago"
          onReconnect={() => router.push('/sign-up?step=3')}
          onDisconnect={() => console.log('Disconnect Google account')}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">NFC Cards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                <p>{property.nfcCards} cards active</p>
                <p>Additional cards: $5 each</p>
              </div>
              <Button className="w-full" variant="outline">
                <Smartphone className="h-4 w-4 mr-2" />
                Manage Cards
              </Button>
            </CardContent>
          </Card>

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
              <CardTitle className="text-lg">Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Download Report
              </Button>
              <Button className="w-full" variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Email
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
