"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Search, Star, TrendingUp, Users, Shield, Zap, AlertCircle, ArrowRight, CheckCircle, Sparkles } from "lucide-react"
import { Navigation } from "@/components/navigation"
import Link from "next/link"

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [auditResult, setAuditResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSignUpPrompt, setShowSignUpPrompt] = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a property name or address")
      setIsDialogOpen(true)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use the API routes directly since Convex is having issues
      const placesResponse = await fetch(`/api/test-google-places?query=${encodeURIComponent(searchQuery)}`)
      const placesData = await placesResponse.json()
      
      if (placesData.error) {
        setError(placesData.error)
        setIsDialogOpen(true)
        return
      }

      if (!placesData.results || placesData.results.length === 0) {
        setError("No properties found with that name or address")
        setIsDialogOpen(true)
        return
      }

      const property = placesData.results[0]
      
      // Get reviews for the property
      const reviewsResponse = await fetch(`/api/test-google-reviews?placeId=${property.place_id}`)
      const reviewsData = await reviewsResponse.json()
      
      let allAnalyses: any[] = []
      let overallSentiment = "neutral"
      let topThemes: string[] = []
      let concerns: string[] = []
      
      if (reviewsData && reviewsData.reviews && reviewsData.reviews.length > 0) {
        // Analyze each review with Gemini
        const reviewPromises = reviewsData.reviews.slice(0, 5).map(async (review: any) => {
          try {
            const analysisResponse = await fetch('/api/test-gemini', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                reviewText: review.text,
                rating: review.rating
              }),
            })
            const analysis = await analysisResponse.json()
            return analysis
          } catch (error) {
            console.error('Error analyzing review:', error)
            return null
          }
        })
        
        const analyses = await Promise.all(reviewPromises)
        allAnalyses = analyses.filter(a => a !== null)
        
        // Calculate overall sentiment
        const positiveCount = allAnalyses.filter(a => a.sentiment === 'positive').length
        const negativeCount = allAnalyses.filter(a => a.sentiment === 'negative').length
        
        if (positiveCount > negativeCount) {
          overallSentiment = "positive"
        } else if (negativeCount > positiveCount) {
          overallSentiment = "negative"
        }
        
        // Collect themes and concerns
        const allThemes = allAnalyses.flatMap(a => a.themes || [])
        const themeCounts = allThemes.reduce((acc: any, theme: string) => {
          acc[theme] = (acc[theme] || 0) + 1
          return acc
        }, {})
        
        topThemes = Object.entries(themeCounts)
          .sort(([,a]: any, [,b]: any) => b - a)
          .slice(0, 5)
          .map(([theme]) => theme)
        
        // Collect concerns from negative reviews
        concerns = allAnalyses
          .filter(a => a.sentiment === 'negative' && a.themes)
          .flatMap(a => a.themes)
          .slice(0, 3)
      }
      
      // Calculate AptReputation Score
      let aptReputationScore = 50 // Base score
      if (property.rating) {
        aptReputationScore = Math.round(property.rating * 20) // Convert 5-star to 100-point scale
      }
      
      // Adjust score based on sentiment analysis
      if (overallSentiment === "positive") {
        aptReputationScore = Math.min(100, aptReputationScore + 10)
      } else if (overallSentiment === "negative") {
        aptReputationScore = Math.max(0, aptReputationScore - 15)
      }
      
      // Generate recommendations
      const recommendations = []
      if (aptReputationScore >= 80) {
        recommendations.push("Excellent reputation! Keep up the great work.")
        recommendations.push("Consider highlighting positive reviews in marketing materials.")
      } else if (aptReputationScore >= 60) {
        recommendations.push("Good reputation with room for improvement.")
        recommendations.push("Focus on addressing the most common concerns.")
      } else {
        recommendations.push("Reputation needs attention. Prioritize addressing negative feedback.")
        recommendations.push("Consider implementing immediate improvements based on review themes.")
      }
      
      if (concerns.length > 0) {
        recommendations.push(`Address concerns about: ${concerns.join(', ')}`)
      }
      
      // Log the complete audit (using API route for now)
      try {
        await fetch('/api/log-audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            propertyName: property.name,
            propertyAddress: property.formatted_address,
            googleRating: property.rating,
            totalReviews: property.user_ratings_total || 0,
            aptReputationScore,
            sentiment: overallSentiment,
            topThemes,
            concerns,
            recommendations
          }),
        })
      } catch (error) {
        console.error('Error logging audit:', error)
      }

      setAuditResult({
        property: {
          name: property.name,
          address: property.formatted_address,
          rating: property.rating,
          totalReviews: property.user_ratings_total || 0,
          placeId: property.place_id,
        },
        analysis: {
          aptReputationScore,
          sentiment: overallSentiment,
          topThemes,
          concerns,
          recommendations,
          reviewCount: allAnalyses.length
        }
      })

      setIsDialogOpen(true)
    } catch (error) {
      console.error("Error during audit:", error)
      setError("An error occurred during the audit. Please try again.")
      setIsDialogOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Logo */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/apt-reputation-logo-full-xl.png"
              alt="APT Reputation"
              width={300}
              height={80}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Transform Your Property's
            <span className="text-blue-600"> Online Reputation</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI-powered reputation management for apartment owners and property managers. 
            Monitor, analyze, and improve your Google reviews automatically.
          </p>
          
          {/* Search Section */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold mb-4">Free Reputation Audit</h2>
              <p className="text-gray-600 mb-6">
                See how AI can transform your review management. Get instant insights into your property's reputation.
              </p>
              <div className="flex gap-3">
                <Input
                  placeholder="Enter property name or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSearch} 
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Analyzing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      Audit Now
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything You Need to Manage Your Reputation
            </h2>
            <p className="text-xl text-gray-600">
              From automated review responses to AI-powered insights
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle>Review Monitoring</CardTitle>
                <CardDescription>
                  Automatically track all your Google reviews with real-time notifications and sentiment analysis.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>AI-Generated Responses</CardTitle>
                <CardDescription>
                  Get professional, empathetic response drafts for negative reviews that reference specific issues.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle>Performance Insights</CardTitle>
                <CardDescription>
                  Weekly and monthly reports with actionable recommendations to improve your reputation score.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Choose the plan that fits your property management needs
            </p>
          </div>
          
          <div className="max-w-md mx-auto">
            <Card className="border-blue-500 border-2">
              <CardHeader>
                <Badge className="w-fit mb-2">Most Popular</Badge>
                <CardTitle>Professional Plan</CardTitle>
                <div className="text-3xl font-bold">$99<span className="text-lg text-gray-500">/property/month</span></div>
                <CardDescription>Complete AI-powered reputation management</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Full Review Dashboard</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />AI Sentiment & Theme Analysis</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Real-time Review Notifications</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Unlimited AI Response Drafts</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />2 NFC Review Cards Included</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Additional Cards: $5 each</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Weekly Performance Reports</li>
                  <li className="flex items-center"><Star className="h-4 w-4 text-green-500 mr-2" />Priority Support</li>
                </ul>
                <Button className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" size="lg">
                  Start Free Trial
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Reputation Audit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your Property's Reputation Analysis</DialogTitle>
            <DialogDescription>
              AI-powered insights into your property's online reputation
            </DialogDescription>
          </DialogHeader>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Analyzing your property's reputation...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-4">
                <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Error</h3>
                <p className="text-sm">{error}</p>
              </div>
              <Button onClick={() => setIsDialogOpen(false)}>
                Close
              </Button>
            </div>
          ) : auditResult ? (
            <div className="space-y-6">
              {/* Property Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">{auditResult.property.name}</h3>
                <p className="text-gray-600 mb-3">{auditResult.property.address}</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <Star className="h-5 w-5 text-yellow-400 fill-current mr-1" />
                    <span className="font-semibold">{auditResult.property.rating}</span>
                    <span className="text-gray-500 ml-1">({auditResult.property.totalReviews} reviews)</span>
                  </div>
                </div>
              </div>
              
              {/* AptReputation Score */}
              <div className="text-center bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
                <h4 className="font-semibold mb-2">AptReputation Score</h4>
                <div className={`text-4xl font-bold mb-2 ${getScoreColor(auditResult.analysis.aptReputationScore)}`}>
                  {auditResult.analysis.aptReputationScore}/100
                </div>
                <Badge variant={getScoreBadgeVariant(auditResult.analysis.aptReputationScore)} className="text-lg px-4 py-2">
                  {auditResult.analysis.sentiment.charAt(0).toUpperCase() + auditResult.analysis.sentiment.slice(1)} Sentiment
                </Badge>
                {auditResult.analysis.reviewCount > 0 && (
                  <p className="text-sm text-gray-600 mt-2">
                    Analyzed {auditResult.analysis.reviewCount} recent reviews with AI
                  </p>
                )}
              </div>
              
              {/* AI Benefits */}
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center">
                  <Sparkles className="h-5 w-5 text-green-600 mr-2" />
                  AI-Powered Insights
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium mb-2">Top Themes</h5>
                    <div className="space-y-1">
                      {auditResult.analysis.topThemes.length > 0 ? (
                        auditResult.analysis.topThemes.slice(0, 3).map((theme: string, index: number) => (
                          <div key={index} className="text-sm flex items-center">
                            <CheckCircle className="h-3 w-3 text-green-600 mr-2" />
                            {theme}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No themes identified</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2">Key Concerns</h5>
                    <div className="space-y-1">
                      {auditResult.analysis.concerns.length > 0 ? (
                        auditResult.analysis.concerns.slice(0, 3).map((concern: string, index: number) => (
                          <div key={index} className="text-sm flex items-center text-red-600">
                            <AlertCircle className="h-3 w-3 mr-2" />
                            {concern}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm flex items-center text-green-600">
                          <Shield className="h-3 w-3 mr-2" />
                          No major concerns
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* CTA */}
              <div className="text-center pt-4 border-t">
                <p className="text-gray-600 mb-4">
                  {auditResult.analysis.aptReputationScore >= 80 
                    ? "Excellent reputation! Ready to monitor and maintain your success?"
                    : auditResult.analysis.aptReputationScore >= 60
                    ? "Good reputation with room for improvement. Ready to enhance your score?"
                    : "Reputation needs attention. Ready to turn things around?"
                  }
                </p>
                <div className="space-y-3">
                  <Button 
                    size="lg" 
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" 
                    onClick={() => setShowSignUpPrompt(true)}
                  >
                    Start Managing Your Reputation
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <p className="text-sm text-gray-500">
                    Free 14-day trial • Cancel anytime • No setup fees
                  </p>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Property Ready:</strong> {auditResult.property.name}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      This property will be automatically added to your account
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Sign Up Prompt Dialog */}
      <Dialog open={showSignUpPrompt} onOpenChange={setShowSignUpPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ready to Get Started?</DialogTitle>
            <DialogDescription>
              Create your account and start managing your property's reputation with AI
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {auditResult && (
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2 text-green-800">Property Ready to Add:</h4>
                <div className="text-sm text-green-700">
                  <p className="font-medium">{auditResult.property.name}</p>
                  <p className="text-xs mt-1">{auditResult.property.address}</p>
                  <p className="text-xs mt-1">Current Rating: ⭐ {auditResult.property.rating}</p>
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-semibold mb-2">What's Included:</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  AI-powered review analysis
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  Real-time notifications
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  2 NFC review cards included
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  Response management
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <Link 
                href={auditResult ? 
                  `/sign-up?propertyName=${encodeURIComponent(auditResult.property.name)}&propertyAddress=${encodeURIComponent(auditResult.property.address)}&propertyPlaceId=${encodeURIComponent(auditResult.property.placeId)}&propertyRating=${auditResult.property.rating}` : 
                  '/sign-up'
                } 
                className="w-full"
              >
                <Button size="lg" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Create Account
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <p className="text-sm text-gray-500 text-center">
                Already have an account? <Link href="/sign-in" className="text-blue-600 hover:underline">Sign in</Link>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Logo and Description */}
            <div className="md:col-span-2">
              <div className="mb-4">
                <Image
                  src="/apt-reputation-logo-full-lg.png"
                  alt="APT Reputation"
                  width={200}
                  height={53}
                  className="h-10 w-auto"
                />
              </div>
              <p className="text-gray-300 mb-4">
                AI-powered reputation management for apartment owners and property managers. 
                Monitor, analyze, and improve your Google reviews automatically.
              </p>
              <div className="flex space-x-4">
                <Link href="/sign-up" className="text-blue-400 hover:text-blue-300 transition-colors">
                  Get Started
                </Link>
                <Link href="/sign-in" className="text-blue-400 hover:text-blue-300 transition-colors">
                  Sign In
                </Link>
              </div>
            </div>
            
            {/* Quick Links */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><Link href="/sign-up" className="text-gray-300 hover:text-white transition-colors">Get Started</Link></li>
                <li><Link href="/sign-up" className="text-gray-300 hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/sign-in" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            
            {/* Support */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Support</h3>
              <ul className="space-y-2">
                <li><Link href="/sign-in" className="text-gray-300 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link href="/sign-in" className="text-gray-300 hover:text-white transition-colors">Contact Us</Link></li>
                <li><Link href="/sign-in" className="text-gray-300 hover:text-white transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-gray-400">
              © 2024 APT Reputation. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
