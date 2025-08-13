import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Verify the webhook is from Google (implement proper verification in production)
    // For now, we'll process the review data
    
    const { review, location, account } = body
    
    if (!review || !location) {
      return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 })
    }

    console.log('Received review webhook:', {
      reviewId: review.reviewId,
      locationName: location.name,
      rating: review.rating,
      comment: review.comment,
      reviewer: review.reviewer?.displayName
    })

    // Find the property associated with this Google location
    const propertiesWithMappings = await convex.query(api.googleApis.getPropertiesWithGoogleMappings)
    const propertyMapping = propertiesWithMappings.find(
      (mapping) => mapping.googleLocation?.locationName === location.name
    )

    if (!propertyMapping) {
      console.log('No property mapping found for location:', location.name)
      return NextResponse.json({ success: true, message: 'No property mapping found' })
    }

    const property = propertyMapping.property
    const googleLocation = propertyMapping.googleLocation

    // Analyze the review with AI
    const analysisResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/test-gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reviewText: review.comment || '',
        rating: review.rating || 0
      }),
    })

    if (!analysisResponse.ok) {
      console.error('Failed to analyze review with AI')
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
    }

    const analysis = await analysisResponse.json()

    // Store the review in Convex database
    try {
      await convex.mutation(api.reviews.createReview, {
        propertyId: property._id,
        googleReviewId: review.reviewId,
        reviewerName: review.reviewer?.displayName || 'Anonymous',
        rating: review.rating,
        reviewText: review.comment || '',
        reviewDate: new Date(review.createTime).getTime(),
        sentiment: analysis.sentiment || 'neutral',
        themes: analysis.themes || [],
        needsResponse: analysis.needsResponse || false,
        hasResponse: false,
      })
    } catch (dbError) {
      console.error('Error storing review in database:', dbError)
    }

    // Generate AI response if needed
    if (analysis.needsResponse && analysis.sentiment === 'negative') {
      const aiResponse = await generateAIResponse(review, analysis, property.name)
      
      // Post response to Google My Business API
      await postResponseToGoogle(review.reviewId, aiResponse, location.name)
      
      // Update review with response
      try {
        const reviews = await convex.query(api.reviews.getReviewsByProperty, { propertyId: property._id })
        const reviewToUpdate = reviews.find(r => r.googleReviewId === review.reviewId)
        if (reviewToUpdate) {
          await convex.mutation(api.reviews.updateReview, {
            reviewId: reviewToUpdate._id,
            responseText: aiResponse,
            responseDate: Date.now(),
            hasResponse: true,
          })
        }
      } catch (updateError) {
        console.error('Error updating review with response:', updateError)
      }
    }

    // Send notification to property manager
    await sendNotification({
      type: 'new_review',
      propertyName: property.name,
      location: location.name,
      rating: review.rating,
      needsResponse: analysis.needsResponse,
      sentiment: analysis.sentiment
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing review webhook:', error)
    return NextResponse.json(
      { error: 'Failed to process review' },
      { status: 500 }
    )
  }
}

async function generateAIResponse(review: any, analysis: any, propertyName: string): Promise<string> {
  // This would use your AI service to generate a professional response
  // For now, we'll return a template response
  
  const templates = {
    negative: [
      `Thank you for your feedback about ${propertyName}. We take all reviews seriously and are committed to improving our services. We've addressed the concerns you mentioned and would welcome the opportunity to discuss this further. Please contact us directly so we can make things right.`,
      `We apologize for the experience you had at ${propertyName}. Your feedback is valuable to us and we're working to ensure this doesn't happen again. We'd love to have another chance to provide you with the excellent service our residents expect.`,
      `Thank you for bringing this to our attention regarding ${propertyName}. We're disappointed that we didn't meet your expectations and are taking immediate steps to address the issues you've raised. Please reach out to us so we can resolve this personally.`
    ],
    neutral: [
      `Thank you for your review of ${propertyName}. We appreciate your feedback and are always looking for ways to improve our services and facilities.`,
      `We value your input about ${propertyName} and will use your feedback to continue enhancing the resident experience at our property.`
    ]
  }

  const templateType = analysis.sentiment === 'negative' ? 'negative' : 'neutral'
  const templatesList = templates[templateType]
  const randomTemplate = templatesList[Math.floor(Math.random() * templatesList.length)]

  return randomTemplate
}

async function postResponseToGoogle(reviewId: string, responseText: string, locationName: string) {
  try {
    // Get the access token for this location's account
    const propertiesWithMappings = await convex.query(api.googleApis.getPropertiesWithGoogleMappings)
    const propertyMapping = propertiesWithMappings.find(
      (mapping) => mapping.googleLocation?.locationName === locationName
    )

    if (!propertyMapping) {
      console.error('No property mapping found for posting response')
      return
    }

    // Get the OAuth tokens for the user who owns this property
    const userProperties = await convex.query(api.userProperties.getUserProperties, { propertyId: propertyMapping.property._id })
    if (!userProperties || userProperties.length === 0) {
      console.error('No user found for property')
      return
    }

    const userId = userProperties[0].userId
    const oauthTokens = await convex.query(api.googleApis.getOAuthTokens, { userId })

    if (!oauthTokens || !oauthTokens.accessToken) {
      console.error('No OAuth tokens found for user')
      return
    }

    // Post response to Google My Business API
    const response = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${reviewId}/reply`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: responseText,
        }),
      }
    )

    if (!response.ok) {
      console.error('Failed to post response to Google:', await response.text())
    } else {
      console.log('Successfully posted response to Google My Business')
    }
  } catch (error) {
    console.error('Error posting response to Google:', error)
  }
}

async function sendNotification(data: any) {
  // Send notification to property manager
  // This could be email, SMS, or in-app notification
  console.log('Sending notification:', data)
  
  // In production, you would:
  // 1. Find the property manager for this property
  // 2. Send email/SMS notification
  // 3. Create in-app notification
  // 4. Update dashboard with new review alert
}
