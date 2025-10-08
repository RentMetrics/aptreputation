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
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden min-h-[600px] flex items-center">
        {/* Hero Background Image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/aptreputation_hero_header.png"
            alt="Background"
            fill
            className="object-cover opacity-30"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/95 to-indigo-100/95"></div>
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10 w-full">
          {/* Hero Logo */}
          <div className="mb-8 flex justify-center animate-fade-in">
            <Image
              src="/apt-reputation-logo-full-xl.png"
              alt="APT Reputation"
              width={300}
              height={80}
              className="h-20 w-auto sm:h-24 drop-shadow-lg"
              priority
            />
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Transform Your Property's
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Online Reputation</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-700 mb-10 max-w-3xl mx-auto">
            AI-powered reputation management for apartment owners and property managers.
            Monitor, analyze, and improve your Google reviews automatically.
          </p>

          {/* Search Section */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-gray-100">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-gray-900">Free Reputation Audit</h2>
              <p className="text-gray-600 mb-6 text-lg">
                See how AI can transform your review management. Get instant insights into your property's reputation.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Enter property name or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 h-14 text-lg px-4 border-2 focus:border-blue-500"
                />
                <Button
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold px-8 h-14 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl text-lg"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Analyzing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Search className="h-6 w-6" />
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
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              Everything You Need to Manage Your Reputation
            </h2>
            <p className="text-xl sm:text-2xl text-gray-600 max-w-3xl mx-auto">
              From automated review responses to AI-powered insights
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 border-transparent hover:border-blue-500 transition-all duration-300 hover:shadow-xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                  <Search className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl mb-3">Review Monitoring</CardTitle>
                <CardDescription className="text-base text-gray-600">
                  Automatically track all your Google reviews with real-time notifications and sentiment analysis.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 border-transparent hover:border-green-500 transition-all duration-300 hover:shadow-xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl mb-3">AI-Generated Responses</CardTitle>
                <CardDescription className="text-base text-gray-600">
                  Get professional, empathetic response drafts for negative reviews that reference specific issues.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 border-transparent hover:border-purple-500 transition-all duration-300 hover:shadow-xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl mb-3">Performance Insights</CardTitle>
                <CardDescription className="text-base text-gray-600">
                  Weekly and monthly reports with actionable recommendations to improve your reputation score.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* NFC Card Feature Section */}
      <section className="py-24 bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Text Content */}
            <div className="order-2 md:order-1">
              <Badge className="mb-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 text-sm font-semibold">Smart Review Collection</Badge>
              <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                Make Leaving Reviews
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Effortless</span>
              </h2>
              <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                Our innovative NFC review cards make it incredibly easy for residents to share their positive experiences.
                Simply tap the card on any smartphone, and they're instantly directed to your property's review page.
              </p>

              <div className="space-y-5 mb-10">
                <div className="flex items-start gap-4 bg-white/60 backdrop-blur-sm p-4 rounded-xl">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1 text-lg">Instant Access</h3>
                    <p className="text-gray-600">One tap on any smartphone opens the review page - no app required</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 bg-white/60 backdrop-blur-sm p-4 rounded-xl">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1 text-lg">Staff Empowerment</h3>
                    <p className="text-gray-600">Equip your team with cards to request reviews during positive interactions</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 bg-white/60 backdrop-blur-sm p-4 rounded-xl">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1 text-lg">Increase Review Volume</h3>
                    <p className="text-gray-600">Capture more positive reviews by making the process frictionless</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 bg-white/60 backdrop-blur-sm p-4 rounded-xl">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1 text-lg">Included in Your Plan</h3>
                    <p className="text-gray-600">2 NFC cards included with every subscription, additional cards just $5 each</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 shadow-lg text-white">
                <p className="text-base leading-relaxed">
                  <strong className="text-yellow-300">Pro Tip:</strong> Position your review cards at the front desk,
                  in the leasing office, or give them to maintenance staff to hand out after completing service requests.
                  The easier you make it, the more reviews you'll collect!
                </p>
              </div>
            </div>

            {/* Image */}
            <div className="order-1 md:order-2">
              <div className="relative">
                <div className="absolute -inset-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-3xl opacity-30 blur-2xl animate-pulse"></div>
                <div className="relative bg-white p-4 rounded-3xl shadow-2xl">
                  <Image
                    src="/aptreputation_card_image.png"
                    alt="NFC Review Card"
                    width={600}
                    height={400}
                    className="relative rounded-2xl w-full h-auto"
                  />
                </div>
              </div>
            </div>
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
