import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const placeId = searchParams.get('placeId')
    
    if (!placeId) {
      return NextResponse.json({ error: 'Place ID parameter is required' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
    )
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.status !== 'OK') {
      throw new Error(`Google Places API error: ${data.status}`)
    }
    
    return NextResponse.json({
      rating: data.result.rating,
      totalReviews: data.result.user_ratings_total,
      reviews: data.result.reviews || []
    })
  } catch (error) {
    console.error('Error testing Google Reviews API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 