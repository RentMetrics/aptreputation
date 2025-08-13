#!/usr/bin/env node

/**
 * Test script to verify Google Cloud Console setup
 * Run this after completing the Google Cloud Console setup
 */

const https = require('https');
const http = require('http');

console.log('🔍 Testing Google Cloud Console Setup...\n');

// Check if environment variables are set
const requiredEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXT_PUBLIC_APP_URL'
];

console.log('📋 Checking Environment Variables:');
let missingVars = [];

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: Set`);
  } else {
    console.log(`❌ ${varName}: Missing`);
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.log('Please add them to your .env.local file');
  process.exit(1);
}

console.log('\n✅ All environment variables are set!');

// Test the auth endpoint
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
const authUrl = `${appUrl}/api/google/auth?redirect_uri=/sign-up`;

console.log('\n🌐 Testing Auth Endpoint:');
console.log(`URL: ${authUrl}`);

const url = new URL(authUrl);
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname + url.search,
  method: 'GET',
  timeout: 5000
};

const protocol = url.protocol === 'https:' ? https : http;

const req = protocol.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('✅ Auth endpoint is responding correctly');
  } else if (res.statusCode === 500) {
    console.log('❌ Auth endpoint returned 500 error');
    console.log('This might be due to missing Google credentials');
  } else {
    console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
  }
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.authUrl) {
        console.log('✅ Auth URL generated successfully');
        console.log(`Auth URL: ${response.authUrl.substring(0, 100)}...`);
      } else if (response.error) {
        console.log(`❌ Error: ${response.error}`);
      }
    } catch (e) {
      console.log('⚠️  Could not parse response as JSON');
    }
  });
});

req.on('error', (err) => {
  console.log(`❌ Request failed: ${err.message}`);
  console.log('Make sure your development server is running (npm run dev)');
});

req.on('timeout', () => {
  console.log('❌ Request timed out');
  req.destroy();
});

req.end();

console.log('\n📝 Next Steps:');
console.log('1. Make sure your development server is running: npm run dev');
console.log('2. Visit the signup page and test the Google integration');
console.log('3. Check the browser console for any errors');
console.log('4. Verify the OAuth flow works end-to-end');
