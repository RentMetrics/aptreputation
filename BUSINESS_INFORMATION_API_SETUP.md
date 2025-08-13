# Business Information API Setup Guide

## Overview

This guide walks you through setting up the Google My Business Business Information API integration for AptReputation. This integration allows your application to:

- Connect to Google My Business accounts
- Monitor reviews in real-time via webhooks
- Automatically generate AI responses to reviews
- Manage business information programmatically
- Track review sentiment and themes

## Current Status ✅

Based on your screenshot, you have:
- ✅ Google Cloud Project: "AptReputation"
- ✅ My Business Business Information API: **Enabled**
- ✅ Service account created

## Step 1: Complete API Setup

### 1.1 Enable Additional Required APIs

In your Google Cloud Console, enable these additional APIs:

1. **Google My Business Account Management API**
   - Go to APIs & Services > Library
   - Search for "My Business Account Management API"
   - Click "Enable"

2. **Google My Business Notifications API** (for webhooks)
   - Search for "My Business Notifications API"
   - Click "Enable"

3. **Google Places API** (for property search)
   - Search for "Places API"
   - Click "Enable"

### 1.2 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **"Create Credentials"** > **"OAuth 2.0 Client IDs"**
3. Configure the OAuth consent screen:
   - **User Type**: External
   - **App name**: AptReputation
   - **User support email**: [your email]
   - **Developer contact information**: [your email]
   - **Scopes**: Add these required scopes:
     ```
     https://www.googleapis.com/auth/business.manage
     https://www.googleapis.com/auth/plus.business.manage
     https://www.googleapis.com/auth/userinfo.email
     https://www.googleapis.com/auth/userinfo.profile
     ```

4. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Name**: AptReputation Web Client
   - **Authorized redirect URIs**: 
     - `http://localhost:3001/api/google/callback` (development)
     - `https://yourdomain.com/api/google/callback` (production)

## Step 2: Environment Variables

Add these to your `.env.local` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_oauth_client_id_here
GOOGLE_CLIENT_SECRET=your_oauth_client_secret_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_CONVEX_URL=your_convex_url_here

# Google Places API (for property search)
GOOGLE_PLACES_API_KEY=your_google_places_api_key

# Gemini API (for AI analysis)
GEMINI_API_KEY=your_gemini_api_key
```

## Step 3: Database Schema

The following tables have been added to your Convex schema:

### Google OAuth Tokens
```typescript
googleOAuthTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  scope: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### Google My Business Accounts
```typescript
googleMyBusinessAccounts: defineTable({
  userId: v.id("users"),
  accountName: v.string(), // e.g., "accounts/123456789"
  accountId: v.string(), // e.g., "123456789"
  accountType: v.optional(v.string()),
  createdAt: v.number(),
})
```

### Google My Business Locations
```typescript
googleMyBusinessLocations: defineTable({
  accountId: v.id("googleMyBusinessAccounts"),
  locationName: v.string(), // e.g., "accounts/123456789/locations/987654321"
  locationId: v.string(), // e.g., "987654321"
  title: v.optional(v.string()),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  rating: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  createdAt: v.number(),
})
```

### Property-Google Location Mapping
```typescript
propertyGoogleMapping: defineTable({
  propertyId: v.id("properties"),
  googleLocationId: v.id("googleMyBusinessLocations"),
  startingRating: v.optional(v.number()),
  webhookUrl: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
})
```

## Step 4: API Endpoints

### OAuth Flow
- `GET /api/google/auth` - Initiate OAuth flow
- `GET /api/google/callback` - Handle OAuth callback and store tokens

### My Business Operations
- `GET /api/google/my-business` - Get accounts and locations
- `POST /api/google/my-business` - Link property to location

### Review Processing
- `POST /api/google/reviews/webhook` - Handle review notifications from Google

## Step 5: Convex Functions

### Google API Functions (`convex/googleApis.ts`)
- `storeOAuthTokens` - Store OAuth tokens for a user
- `getOAuthTokens` - Retrieve OAuth tokens for a user
- `storeMyBusinessAccounts` - Store Google My Business accounts
- `storeMyBusinessLocations` - Store Google My Business locations
- `getMyBusinessAccounts` - Get accounts for a user
- `getMyBusinessLocations` - Get locations for an account
- `linkPropertyToGoogleLocation` - Link property to Google location
- `getPropertyGoogleMapping` - Get property-Google mapping
- `getPropertiesWithGoogleMappings` - Get all properties with mappings

### Review Functions (`convex/reviews.ts`)
- `createReview` - Create a new review
- `updateReview` - Update review with response
- `getReviewsByProperty` - Get reviews for a property
- `getReviewsNeedingResponse` - Get reviews needing responses

## Step 6: Webhook Setup

### 6.1 Configure Webhook URL

Set up a webhook URL that Google can use to notify your application of new reviews:

```
https://yourdomain.com/api/google/reviews/webhook
```

### 6.2 Webhook Processing

The webhook handler (`/api/google/reviews/webhook`) performs these actions:

1. **Receives review notification** from Google
2. **Finds associated property** using location mapping
3. **Analyzes review** with AI (sentiment, themes, needs response)
4. **Stores review** in database
5. **Generates AI response** if needed
6. **Posts response** to Google My Business API
7. **Sends notifications** to property managers

## Step 7: Testing the Integration

### 7.1 Test OAuth Flow

1. Start your development server: `npm run dev`
2. Go to the signup flow
3. Click "Connect Google My Business"
4. Complete the OAuth flow
5. Verify account and location selection

### 7.2 Test Review Monitoring

1. Create a test review on your Google My Business listing
2. Verify the webhook receives the notification
3. Check that AI analysis is triggered
4. Verify response generation and posting

### 7.3 Test API Endpoints

```bash
# Test OAuth initiation
curl "http://localhost:3001/api/google/auth?redirect_uri=/dashboard"

# Test My Business data retrieval
curl "http://localhost:3001/api/google/my-business?access_token=YOUR_TOKEN"
```

## Step 8: Production Deployment

### 8.1 Security Considerations

1. **Store tokens securely**: OAuth tokens are encrypted in Convex
2. **Implement token refresh**: Handle expired access tokens
3. **Webhook security**: Verify webhook signatures
4. **Rate limiting**: Implement API rate limiting
5. **Error handling**: Graceful handling of API failures

### 8.2 Environment Setup

1. Update OAuth credentials with production domain
2. Update environment variables with production URLs
3. Ensure your domain is verified in Google Cloud Console
4. Set up proper SSL certificates

### 8.3 Monitoring

Set up monitoring for:
- OAuth token expiration
- Webhook delivery failures
- API rate limit usage
- Review processing errors

## Step 9: Usage Examples

### 9.1 Connect a Property to Google My Business

```typescript
// After OAuth flow, link property to location
await convex.mutation(api.googleApis.linkPropertyToGoogleLocation, {
  propertyId: propertyId,
  googleLocationId: googleLocationId,
  startingRating: 4.2,
  webhookUrl: "https://yourdomain.com/api/google/reviews/webhook"
})
```

### 9.2 Get Properties with Google Integration

```typescript
const propertiesWithGoogle = await convex.query(api.googleApis.getPropertiesWithGoogleMappings)
```

### 9.3 Monitor Reviews

```typescript
const reviewsNeedingResponse = await convex.query(api.reviews.getReviewsNeedingResponse, {
  propertyId: propertyId
})
```

## Troubleshooting

### Common Issues

1. **"Redirect URI mismatch" error**
   - Check that your redirect URI exactly matches what's configured in Google Cloud Console
   - Include the full path: `/api/google/callback`

2. **"API not enabled" error**
   - Make sure all required APIs are enabled in your Google Cloud project
   - Verify billing is set up

3. **"Webhook not receiving notifications"**
   - Check webhook URL is accessible
   - Verify webhook verification is implemented
   - Check Google My Business notification settings

4. **"Token expiration"**
   - Implement refresh token logic
   - Store refresh tokens securely

### Debug Mode

Enable debug logging by setting:

```env
DEBUG_GOOGLE_INTEGRATION=true
```

## API Reference

### Google My Business Business Information API

**Base URL**: `https://mybusinessbusinessinformation.googleapis.com/v1/`

**Key Endpoints**:
- `GET /accounts` - List My Business accounts
- `GET /{accountName}/locations` - List locations for an account
- `GET /{locationName}` - Get location details
- `PATCH /{locationName}` - Update location information

### Google My Business Account Management API

**Base URL**: `https://mybusinessaccountmanagement.googleapis.com/v1/`

**Key Endpoints**:
- `GET /accounts` - List accounts
- `GET /accounts/{accountName}` - Get account details

### Google My Business API v4 (for reviews)

**Base URL**: `https://mybusiness.googleapis.com/v4/`

**Key Endpoints**:
- `GET /{locationName}/reviews` - List reviews
- `POST /{locationName}/reviews/{reviewId}/reply` - Reply to a review

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

## Next Steps

After completing this setup:

1. **Test the complete flow** end-to-end
2. **Implement token refresh logic** for long-term access
3. **Add webhook signature verification** for security
4. **Set up monitoring and alerting** for the integration
5. **Create user documentation** for property managers
6. **Implement advanced features** like bulk operations and analytics
