#!/bin/bash

# HuddleAI Cloud Functions Deployment Script
# This script helps deploy the cloud functions for meeting processing

echo "🚀 HuddleAI Cloud Functions Deployment"
echo "======================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ You are not logged in to Firebase. Please login first:"
    echo "   firebase login"
    exit 1
fi

# Navigate to functions directory
cd functions

echo "📦 Installing dependencies..."
npm install

echo "🔧 Building functions..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors and try again."
    exit 1
fi

echo "🧪 Running linter..."
npm run lint

# Check if linting passed
if [ $? -ne 0 ]; then
    echo "⚠️  Linting issues found. Please fix them and try again."
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "☁️  Deploying functions..."
firebase deploy --only functions

if [ $? -eq 0 ]; then
    echo "✅ Functions deployed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Enable the Speech-to-Text API in Google Cloud Console"
    echo "2. Set up billing for your Google Cloud project"
    echo "3. Update storage rules if needed"
    echo "4. Test the upload functionality"
    echo ""
    echo "🔗 Useful links:"
    echo "   - Firebase Console: https://console.firebase.google.com"
    echo "   - Google Cloud Console: https://console.cloud.google.com"
    echo "   - Speech-to-Text API: https://console.cloud.google.com/apis/library/speech.googleapis.com"
else
    echo "❌ Deployment failed. Please check the errors above."
    exit 1
fi 