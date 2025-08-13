# Quick Google Cloud Setup Checklist

## 🚀 Get Started (5 minutes)

### 1. Create Google Cloud Project
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Create new project: `apt-reputation-gmb`
- [ ] Select the new project

### 2. Enable APIs (2 minutes)
- [ ] Go to **APIs & Services** > **Library**
- [ ] Search and enable:
  - [ ] Google My Business Account Management API
  - [ ] Google My Business Business Information API
  - [ ] Google My Business Notifications API

### 3. Create OAuth Credentials (3 minutes)
- [ ] Go to **APIs & Services** > **Credentials**
- [ ] Click "Create Credentials" > "OAuth client ID"
- [ ] Configure OAuth consent screen:
  - [ ] App name: `APT Reputation`
  - [ ] User support email: [your email]
  - [ ] Add scopes (see detailed guide)
- [ ] Create OAuth 2.0 Client ID:
  - [ ] Type: Web application
  - [ ] Name: `APT Reputation Web Client`
  - [ ] Authorized origins: `http://localhost:3001`
  - [ ] Redirect URIs: `http://localhost:3001/api/google/callback`
- [ ] **Save Client ID and Client Secret**

### 4. Update Environment Variables
- [ ] Copy `env.example` to `.env.local`
- [ ] Replace placeholder values with your actual credentials:
  ```env
  GOOGLE_CLIENT_ID=your_actual_client_id
  GOOGLE_CLIENT_SECRET=your_actual_client_secret
  NEXT_PUBLIC_APP_URL=http://localhost:3001
  ```

### 5. Test the Setup
- [ ] Restart your dev server: `npm run dev`
- [ ] Run test script: `node scripts/test-google-setup.js`
- [ ] Visit signup page and test Google integration

## ✅ Done!

Once completed, your Google My Business integration will be fully functional!

## 🆘 Need Help?

- Check the detailed guide: `GOOGLE_CLOUD_SETUP_GUIDE.md`
- Run the test script to verify setup
- Check server logs for specific error messages
