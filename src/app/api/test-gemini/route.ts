import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { reviewText, rating } = await request.json()
    
    if (!reviewText || rating === undefined) {
      return NextResponse.json({ error: 'Review text and rating are required' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY
    
    if (!apiKey || apiKey === 'your_actual_gemini_api_key_here') {
      return NextResponse.json({ 
        error: 'Gemini API key not configured. Please add your actual Gemini API key to .env.local' 
      }, { status: 500 })
    }

    const prompt = `
      Analyze this apartment review and provide:
      1. Sentiment (positive, neutral, or negative)
      2. Key themes/topics mentioned (e.g., Maintenance, Staff, Amenities, Noise, etc.)
      3. Whether this review needs a response (true if rating <= 3 or mentions serious issues)
      
      Review: "${reviewText}"
      Rating: ${rating}/5 stars
      
      Respond in JSON format:
      {
        "sentiment": "positive|neutral|negative",
        "themes": ["theme1", "theme2", "theme3"],
        "needsResponse": true|false,
        "reasoning": "brief explanation"
      }
    `

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error response:', errorText)
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response structure:', data)
      throw new Error('Invalid response structure from Gemini API')
    }

    const responseText = data.candidates[0].content.parts[0].text
    
    // Clean up the response text to extract JSON
    let jsonText = responseText.trim()
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '')
    }
    
    // Remove any leading/trailing whitespace
    jsonText = jsonText.trim()
    
    const analysis = JSON.parse(jsonText)
    
    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error testing Gemini API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 