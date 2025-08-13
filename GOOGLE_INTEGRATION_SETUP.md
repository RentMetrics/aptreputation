# Google My Business Integration Setup

This guide explains how to set up the Google My Business integration for AptReputation to enable automatic review monitoring and AI responses.

## Overview

The Google integration allows AptReputation to:
- Connect to your Google My Business account
- Monitor new reviews in real-time
- Generate AI-powered responses automatically
- Send notifications to property managers
- Track review sentiment and themes

## Prerequisites

1. **Google Cloud Console Account**
2. **Google My Business API enabled**
3. **OAuth 2.0 credentials configured**

## Step 1: Google Cloud Console Setup

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable billing for the project

### 1.2 Enable Required APIs

Enable the following APIs in your Google Cloud Console:

```bash
# Google My Business Account Management API
https://mybusinessaccountmanagement.googleapis.com/

# Google My Business Business Information API
https://mybusinessbusinessinformation.googleapis.com/

# Google My Business API v4
https://mybusiness.googleapis.com/

# Google Places API
https://maps.googleapis.com/maps/api/place/

# Google OAuth2 API
https://oauth2.googleapis.com/
```

### 1.3 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. Configure the OAuth consent screen:
   - User Type: External
   - App name: AptReputation
   - User support email: your-email@domain.com
   - Developer contact information: your-email@domain.com
   - Scopes: Add the required scopes (see below)

4. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Name: AptReputation Web Client
   - Authorized redirect URIs: `https://yourdomain.com/api/google/callback`

### 1.4 Required OAuth Scopes

Add these scopes to your OAuth consent screen:

```
https://www.googleapis.com/auth/business.manage
https://www.googleapis.com/auth/plus.business.manage
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

## Step 2: Environment Variables

Add these environment variables to your `.env.local` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret

# App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Google Maps API (for property search)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Step 3: Database Schema

You'll need to store Google integration data in your database. Here's a suggested schema:

```sql
-- Google OAuth tokens
CREATE TABLE google_oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Google My Business accounts
CREATE TABLE google_my_business_accounts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  account_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Google My Business locations
CREATE TABLE google_my_business_locations (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES google_my_business_accounts(id),
  location_name VARCHAR(255) NOT NULL,
  location_id VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  website VARCHAR(255),
  rating DECIMAL(3,2),
  review_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Property-Google location mapping
CREATE TABLE property_google_mapping (
  id SERIAL PRIMARY KEY,
  property_id VARCHAR(255) NOT NULL,
  google_location_id INTEGER REFERENCES google_my_business_locations(id),
  starting_rating DECIMAL(3,2),
  webhook_url VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Step 4: Webhook Setup

### 4.1 Configure Webhook URL

Set up a webhook URL that Google can use to notify your application of new reviews:

```
https://yourdomain.com/api/google/reviews/webhook
```

### 4.2 Webhook Verification

Implement webhook verification to ensure requests are from Google:

```typescript
// Add to your webhook route
const verifyWebhook = (request: NextRequest) => {
  // Implement Google's webhook verification
  // See: https://developers.google.com/my-business/reference/rest/v4/accounts.locations#NotificationSettings
}
```

## Step 5: Testing the Integration

### 5.1 Test OAuth Flow

1. Start the signup process
2. Click "Connect Google My Business"
3. Complete the OAuth flow
4. Verify account and location selection

### 5.2 Test Review Monitoring

1. Create a test review on your Google My Business listing
2. Verify the webhook receives the notification
3. Check that AI analysis is triggered
4. Verify response generation (if needed)

## Step 6: Production Deployment

### 6.1 Security Considerations

1. **Store tokens securely**: Use encrypted storage for OAuth tokens
2. **Implement token refresh**: Handle expired access tokens
3. **Webhook security**: Verify webhook signatures
4. **Rate limiting**: Implement API rate limiting
5. **Error handling**: Graceful handling of API failures

### 6.2 Monitoring

Set up monitoring for:
- OAuth token expiration
- Webhook delivery failures
- API rate limit usage
- Review processing errors

## API Endpoints

### OAuth Flow
- `GET /api/google/auth` - Initiate OAuth flow
- `GET /api/google/callback` - Handle OAuth callback

### My Business Operations
- `GET /api/google/my-business` - Get accounts and locations
- `POST /api/google/my-business` - Link property to location

### Review Processing
- `POST /api/google/reviews/webhook` - Handle review notifications

## Troubleshooting

### Common Issues

1. **OAuth consent screen not configured**
   - Ensure all required scopes are added
   - Verify app is published or in testing

2. **API not enabled**
   - Check that all required APIs are enabled
   - Verify billing is set up

3. **Webhook not receiving notifications**
   - Check webhook URL is accessible
   - Verify webhook verification is implemented
   - Check Google My Business notification settings

4. **Token expiration**
   - Implement refresh token logic
   - Store refresh tokens securely

### Debug Mode

Enable debug logging by setting:

```env
DEBUG_GOOGLE_INTEGRATION=true
```

## Support

For issues with the Google integration:
1. Check Google Cloud Console logs
2. Review application logs
3. Test with Google's API explorer
4. Contact support with error details

## Legal Considerations

- Ensure compliance with Google's API terms of service
- Implement proper data handling for user information
- Follow GDPR/privacy regulations for stored data
- Get user consent for Google account access
