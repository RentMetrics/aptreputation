# Google My Business Integration Requirements

## What We Need from the User

### 1. Google My Business Account Access
The user needs to have:
- A Google My Business account for their property
- Admin or Owner permissions on the GMB account
- The property must be verified and published on Google

### 2. OAuth Authorization
The user will need to:
- Grant our app permission to access their Google My Business data
- Authorize the following scopes:
  - `https://www.googleapis.com/auth/business.manage` - Manage business information
  - `https://www.googleapis.com/auth/plus.business.manage` - Manage business listings
  - `https://www.googleapis.com/auth/userinfo.email` - Access email
  - `https://www.googleapis.com/auth/userinfo.profile` - Access profile info

## What We Need to Set Up (Our Side)

### 1. Google Cloud Console Setup
- Create a Google Cloud Project
- Enable the following APIs:
  - Google My Business Account Management API
  - Google My Business Business Information API
  - Google My Business Notifications API
- Create OAuth 2.0 credentials
- Configure authorized redirect URIs

### 2. Environment Variables
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_APP_URL=your_app_url
```

### 3. Database Schema (Recommended)
```sql
-- Store user's Google OAuth tokens
CREATE TABLE google_oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Store GMB account mappings
CREATE TABLE gmb_accounts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  account_name VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  account_type VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Store GMB location mappings
CREATE TABLE gmb_locations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  account_id VARCHAR NOT NULL,
  location_name VARCHAR NOT NULL,
  location_id VARCHAR NOT NULL,
  property_id VARCHAR, -- Link to our property
  created_at TIMESTAMP DEFAULT NOW()
);

-- Store review data
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  location_id VARCHAR NOT NULL,
  review_id VARCHAR NOT NULL,
  reviewer_name VARCHAR,
  rating INTEGER,
  comment TEXT,
  sentiment VARCHAR,
  ai_response TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Webhook Setup
- Set up webhook endpoints to receive real-time review notifications
- Configure webhook subscriptions in Google My Business
- Handle incoming review data and trigger AI analysis

### 5. API Endpoints We Need
- `/api/google/auth` - Initiate OAuth flow ✅ (Already implemented)
- `/api/google/callback` - Handle OAuth callback ✅ (Already implemented)
- `/api/google/my-business` - List accounts/locations ✅ (Already implemented)
- `/api/google/reviews/webhook` - Handle review notifications ✅ (Already implemented)
- `/api/google/reviews/respond` - Send AI-generated responses
- `/api/google/setup-webhook` - Configure webhook subscriptions

## Current Implementation Status

### ✅ Already Implemented
- OAuth 2.0 flow initiation
- OAuth callback handling
- Basic GMB account/location listing
- Webhook endpoint structure
- UI components for account linking

### 🔄 Needs Completion
- Database integration for storing tokens and mappings
- Webhook subscription setup
- AI response generation and sending
- Error handling and retry logic
- Production OAuth credentials

### 📋 Next Steps
1. Set up Google Cloud Console project and credentials
2. Implement database storage for OAuth tokens
3. Complete webhook subscription setup
4. Test the full integration flow
5. Add error handling and monitoring

## User Flow
1. User clicks "Connect Google My Business"
2. Redirected to Google OAuth consent screen
3. User grants permissions
4. We receive access token and refresh token
5. We fetch their GMB accounts and locations
6. User selects their property's GMB account/location
7. We set up webhook subscriptions for that location
8. Integration is complete - reviews will flow in automatically

## Security Considerations
- Store OAuth tokens securely (encrypted)
- Implement token refresh logic
- Validate webhook signatures
- Rate limit API calls
- Monitor for suspicious activity
