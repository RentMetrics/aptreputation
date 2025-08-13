# Google Cloud Console Setup Guide

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top of the page
3. Click "New Project"
4. Enter project details:
   - **Project name**: `apt-reputation-gmb`
   - **Project ID**: `apt-reputation-gmb-[random-number]` (or let Google generate one)
5. Click "Create"

## Step 2: Enable Required APIs

1. In your new project, go to the **APIs & Services** > **Library**
2. Search for and enable these APIs:
   - **Google My Business Account Management API**
   - **Google My Business Business Information API**
   - **Google My Business Notifications API**
   - **Google+ API** (if available, for legacy support)

3. For each API:
   - Click on the API name
   - Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - **User Type**: External
   - **App name**: APT Reputation
   - **User support email**: [your-email]
   - **Developer contact information**: [your-email]
   - **Authorized domains**: [your-domain.com]
   - **Scopes**: Add these scopes:
     - `https://www.googleapis.com/auth/business.manage`
     - `https://www.googleapis.com/auth/plus.business.manage`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`

4. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Name**: APT Reputation Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:3001` (for development)
     - `https://your-domain.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:3001/api/google/callback` (for development)
     - `https://your-domain.com/api/google/callback` (for production)

5. Click "Create"
6. **Save the Client ID and Client Secret** - you'll need these for your environment variables

## Step 4: Set Up Environment Variables

Add these to your `.env.local` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Step 5: Test the Integration

1. Start your development server: `npm run dev`
2. Go to the signup flow and test the Google integration
3. Check the browser console and server logs for any errors

## Step 6: Production Setup

When deploying to production:

1. Update the OAuth credentials with your production domain
2. Update environment variables with production URLs
3. Ensure your domain is verified in Google Cloud Console
4. Set up proper SSL certificates

## Troubleshooting

### Common Issues:

1. **"Redirect URI mismatch" error**:
   - Check that your redirect URI exactly matches what's configured in Google Cloud Console
   - Include the full path: `/api/google/callback`

2. **"API not enabled" error**:
   - Make sure all required APIs are enabled in your Google Cloud project

3. **"Invalid client" error**:
   - Verify your Client ID and Client Secret are correct
   - Check that you're using the right credentials for your environment

4. **"Scope not allowed" error**:
   - Ensure all required scopes are added to your OAuth consent screen

### Testing the Setup:

1. Visit: `http://localhost:3001/api/google/auth?redirect_uri=/sign-up`
2. You should be redirected to Google's OAuth consent screen
3. After authorization, you should be redirected back to your app

## Security Notes:

- Never commit your Client Secret to version control
- Use environment variables for all sensitive data
- Regularly rotate your OAuth credentials
- Monitor API usage in Google Cloud Console
- Set up proper rate limiting for your endpoints

## Next Steps After Setup:

1. Test the OAuth flow end-to-end
2. Implement database storage for tokens
3. Set up webhook subscriptions
4. Add error handling and retry logic
5. Implement token refresh logic
