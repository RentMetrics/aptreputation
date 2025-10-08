import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { reviews, propertyName } = await request.json()

    if (!reviews || reviews.length === 0) {
      return NextResponse.json(
        { error: 'No reviews provided' },
        { status: 400 }
      )
    }

    // Call Gemini API for review analysis
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const prompt = `You are an expert property management consultant analyzing Google reviews for "${propertyName}".

Analyze these ${reviews.length} reviews and provide actionable insights:

REVIEWS:
${reviews.map((r: any, i: number) => `
Review #${i + 1} (${r.rating} stars):
"${r.text}"
`).join('\n')}

Please provide your analysis in the following JSON format:
{
  "summary": "Brief summary of overall review sentiment and key opportunities (1-2 sentences)",
  "keyFindings": [
    {
      "category": "Category name (e.g., Maintenance Response Time, Staff Friendliness, Amenities)",
      "sentiment": "positive | negative | mixed",
      "frequency": "high | medium | low",
      "impact": "High Impact | Medium Impact | Strength",
      "finding": "Detailed finding with percentage/statistics",
      "recommendation": "Specific, actionable recommendation"
    }
  ],
  "actionPlan": [
    {
      "priority": "Immediate | Short-term | Ongoing",
      "action": "Specific action to take",
      "expectedImpact": "Expected rating improvement and timeframe",
      "effort": "Low | Medium | High"
    }
  ],
  "themes": ["theme1", "theme2", "theme3"]
}

Focus on:
1. Identifying specific pain points mentioned frequently
2. Finding strengths to maintain and leverage
3. Providing concrete, actionable recommendations
4. Estimating realistic impact on ratings
5. Common themes across all reviews`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        }),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to analyze reviews with Gemini')
    }

    const data = await response.json()
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Extract JSON from the response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse analysis response')
    }

    const analysis = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      success: true,
      analysis,
      reviewCount: reviews.length
    })

  } catch (error) {
    console.error('Error analyzing reviews:', error)
    return NextResponse.json(
      {
        error: 'Failed to analyze reviews',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
