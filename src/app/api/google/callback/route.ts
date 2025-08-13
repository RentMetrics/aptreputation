import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') || '/dashboard'
    const error = searchParams.get('error')
    const userId = searchParams.get('user_id') // Pass user ID from the auth flow

    if (error) {
      console.error('Google OAuth error:', error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${state}?error=oauth_denied`)
    }

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${state}?error=no_code`)
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${state}?error=oauth_not_configured`)
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text())
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${state}?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()
    
    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error('Failed to get user info:', await userInfoResponse.text())
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${state}?error=user_info_failed`)
    }

    const userInfo = await userInfoResponse.json()

    // Store tokens in Convex database
    if (userId) {
      try {
        await convex.mutation(api.googleApis.storeOAuthTokens, {
          userId: userId as any, // Type assertion for Convex ID
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
          scope: tokenData.scope || 'https://www.googleapis.com/auth/business.manage',
        })

        // Fetch and store My Business accounts
        const accountsResponse = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
        })

        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json()
          
          if (accountsData.accounts && accountsData.accounts.length > 0) {
            const accounts = accountsData.accounts.map((account: any) => ({
              accountName: account.name,
              accountId: account.name.split('/').pop(),
              accountType: account.type,
            }))

            await convex.mutation(api.googleApis.storeMyBusinessAccounts, {
              userId: userId as any,
              accounts,
            })

            // Fetch locations for the first account (you might want to handle multiple accounts)
            const firstAccount = accounts[0]
            const locationsResponse = await fetch(
              `https://mybusinessbusinessinformation.googleapis.com/v1/${firstAccount.accountName}/locations`,
              {
                headers: {
                  'Authorization': `Bearer ${tokenData.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            )

            if (locationsResponse.ok) {
              const locationsData = await locationsResponse.json()
              
              if (locationsData.locations && locationsData.locations.length > 0) {
                const accountId = await convex.query(api.googleApis.getMyBusinessAccounts, { userId: userId as any })
                if (accountId && accountId.length > 0) {
                  const locations = locationsData.locations.map((location: any) => ({
                    locationName: location.name,
                    locationId: location.name.split('/').pop(),
                    title: location.title,
                    address: location.address?.addressLines?.join(', '),
                    phone: location.phoneNumbers?.primaryPhone,
                    website: location.websiteUri,
                    rating: location.rating,
                    reviewCount: location.reviewCount,
                  }))

                  await convex.mutation(api.googleApis.storeMyBusinessLocations, {
                    accountId: accountId[0]._id,
                    locations,
                  })
                }
              }
            }
          }
        }
      } catch (dbError) {
        console.error('Error storing Google integration data:', dbError)
        // Continue with redirect even if database storage fails
      }
    }

    // Redirect to success page
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}${state}?google_connected=true&user_email=${encodeURIComponent(userInfo.email)}`

    return NextResponse.redirect(successUrl)
  } catch (error) {
    console.error('Error in Google OAuth callback:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?error=oauth_callback_failed`)
  }
}
