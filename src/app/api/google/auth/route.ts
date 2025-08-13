import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const redirectUri = searchParams.get('redirect_uri') || '/dashboard'
    
    const clientId = process.env.GOOGLE_CLIENT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    
    if (!clientId) {
      console.error('GOOGLE_CLIENT_ID environment variable is not set')
      return NextResponse.json({ 
        error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID in your environment variables.' 
      }, { status: 500 })
    }
    
    if (!appUrl) {
      console.error('NEXT_PUBLIC_APP_URL environment variable is not set')
      return NextResponse.json({ 
        error: 'App URL not configured. Please set NEXT_PUBLIC_APP_URL in your environment variables.' 
      }, { status: 500 })
    }
    
    const redirectUrl = `${appUrl}/api/google/callback`

    // Google OAuth 2.0 authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', [
      'https://www.googleapis.com/auth/business.manage',
      'https://www.googleapis.com/auth/plus.business.manage',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('state', redirectUri)

    return NextResponse.json({ authUrl: authUrl.toString() })
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' },
      { status: 500 }
    )
  }
}
