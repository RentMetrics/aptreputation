"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Building,
  TrendingUp,
  TrendingDown,
  Star,
  AlertCircle,
  Plus,
  ArrowRight,
  Calendar,
  MapPin
} from "lucide-react"
import { AddPropertyDialog } from "@/components/add-property-dialog"

export default function PortfolioPage() {
  const router = useRouter()

  // Mock data - replace with real data from Convex
  const properties = [
    {
      id: 1,
      name: "Sunset Apartments",
      address: "123 Sunset Blvd, Austin, TX",
      reputationScore: 84,
      googleRating: 4.4,
      baselineRating: 4.2,
      totalReviews: 171,
      recentReviews: 12,
      pendingResponses: 3,
      monthsSinceSignup: 3,
      improvement: "+0.2",
      improvementPercent: "+4.8%",
      trending: "up",
      lastUpdated: "2 hours ago"
    },
    {
      id: 2,
      name: "Oakwood Properties",
      address: "456 Oak Street, Austin, TX",
      reputationScore: 72,
      googleRating: 3.8,
      baselineRating: 3.8,
      totalReviews: 203,
      recentReviews: 8,
      pendingResponses: 5,
      monthsSinceSignup: 2,
      improvement: "0.0",
      improvementPercent: "0%",
      trending: "stable",
      lastUpdated: "1 day ago"
    },
    {
      id: 3,
      name: "Riverfront Towers",
      address: "789 River Road, Austin, TX",
      reputationScore: 91,
      googleRating: 4.7,
      baselineRating: 4.5,
      totalReviews: 328,
      recentReviews: 18,
      pendingResponses: 1,
      monthsSinceSignup: 6,
      improvement: "+0.2",
      improvementPercent: "+4.4%",
      trending: "up",
      lastUpdated: "3 hours ago"
    }
  ]

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 80) return "default"
    if (score >= 60) return "secondary"
    return "destructive"
  }

  const getTrendIcon = (trending: string) => {
    if (trending === "up") return <TrendingUp className="h-4 w-4 text-green-600" />
    if (trending === "down") return <TrendingDown className="h-4 w-4 text-red-600" />
    return <div className="h-4 w-4" />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
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
              <h1 className="text-3xl font-bold text-gray-900">Property Portfolio</h1>
              <p className="text-gray-600">Manage and monitor all your properties</p>
            </div>
          </div>
          <AddPropertyDialog />
        </div>

        {/* Portfolio Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{properties.length}</div>
              <p className="text-xs text-muted-foreground">Active locations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(properties.reduce((acc, p) => acc + p.googleRating, 0) / properties.length).toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">Across all properties</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {properties.reduce((acc, p) => acc + p.totalReviews, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                +{properties.reduce((acc, p) => acc + p.recentReviews, 0)} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Need Attention</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {properties.reduce((acc, p) => acc + p.pendingResponses, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Pending responses</p>
            </CardContent>
          </Card>
        </div>

        {/* Property Grid */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Properties</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <Card
              key={property.id}
              className="hover:shadow-xl transition-all duration-300 cursor-pointer group border-2 hover:border-blue-500"
              onClick={() => router.push(`/dashboard/property/${property.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <Building className="h-8 w-8 text-blue-600" />
                  <Badge variant={getScoreBadgeVariant(property.reputationScore)} className="text-sm">
                    {property.reputationScore}/100
                  </Badge>
                </div>
                <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                  {property.name}
                </CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {property.address}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Rating & Progress */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Current Rating</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-400 fill-current" />
                      <span className="font-bold text-lg">{property.googleRating}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Baseline: {property.baselineRating}</span>
                    <div className="flex items-center gap-1">
                      {getTrendIcon(property.trending)}
                      <span className={`text-sm font-semibold ${
                        property.improvement.startsWith('+') ? 'text-green-600' :
                        property.improvement === '0.0' ? 'text-gray-500' : 'text-red-600'
                      }`}>
                        {property.improvement} ({property.improvementPercent})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <div className="text-xl font-bold text-blue-600">{property.totalReviews}</div>
                    <div className="text-xs text-gray-600">Total Reviews</div>
                  </div>
                  <div className="text-center p-2 bg-purple-50 rounded-lg">
                    <div className="text-xl font-bold text-purple-600">{property.recentReviews}</div>
                    <div className="text-xs text-gray-600">This Month</div>
                  </div>
                </div>

                {/* Alerts */}
                {property.pendingResponses > 0 && (
                  <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 p-2 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">{property.pendingResponses} reviews need response</span>
                  </div>
                )}

                {/* Time Tracking */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    Tracking for {property.monthsSinceSignup} months
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
