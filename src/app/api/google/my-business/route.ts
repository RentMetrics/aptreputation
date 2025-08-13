import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accessToken = searchParams.get('access_token')
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 })
    }

    // Get user's Google My Business accounts
    const accountsResponse = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!accountsResponse.ok) {
      console.error('Failed to get My Business accounts:', await accountsResponse.text())
      return NextResponse.json({ error: 'Failed to get My Business accounts' }, { status: 500 })
    }

    const accountsData = await accountsResponse.json()
    
    // Get locations for each account
    const accountsWithLocations = await Promise.all(
      accountsData.accounts?.map(async (account: any) => {
        try {
          const locationsResponse = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          )

          if (locationsResponse.ok) {
            const locationsData = await locationsResponse.json()
            return {
              ...account,
              locations: locationsData.locations || []
            }
          } else {
            console.error(`Failed to get locations for account ${account.name}:`, await locationsResponse.text())
            return {
              ...account,
              locations: []
            }
          }
        } catch (error) {
          console.error(`Error getting locations for account ${account.name}:`, error)
          return {
            ...account,
            locations: []
          }
        }
      }) || []
    )

    return NextResponse.json({
      accounts: accountsWithLocations
    })
  } catch (error) {
    console.error('Error fetching My Business data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch My Business data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accessToken, accountName, locationName, propertyData } = body

    if (!accessToken || !accountName || !locationName) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Link the property to the My Business location
    // This would typically involve updating the location with custom attributes
    // or creating a webhook subscription for reviews

    // For now, we'll return a success response
    // In production, you'd want to:
    // 1. Store the account and location information in your database
    // 2. Set up webhook subscriptions for review notifications
    // 3. Configure the location for automated responses

    return NextResponse.json({
      success: true,
      message: 'Property linked successfully',
      accountName,
      locationName,
      propertyData
    })
  } catch (error) {
    console.error('Error linking property to My Business:', error)
    return NextResponse.json(
      { error: 'Failed to link property' },
      { status: 500 }
    )
  }
}
