# HuddleAI Cloud Functions Setup Guide

This guide will help you set up Google Cloud Functions for automatic meeting processing, including speech-to-text conversion and AI-powered summarization.

## 🎯 Overview

The cloud functions automatically process uploaded meeting videos by:
1. **Extracting audio** from MP4 video files using FFmpeg
2. **Converting speech to text** using Google Cloud Speech-to-Text API
3. **Identifying speakers** through speaker diarization
4. **Generating summaries** and extracting action items
5. **Storing results** in Firestore and Cloud Storage

## 📋 Prerequisites

### 1. Google Cloud Project Setup

1. **Create or select a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select an existing one
   - Note your project ID

2. **Enable Required APIs**
   ```bash
   # Enable APIs via gcloud CLI (or use the console)
   gcloud services enable cloudfunctions.googleapis.com
   gcloud services enable speech.googleapis.com
   gcloud services enable storage.googleapis.com
   gcloud services enable firestore.googleapis.com
   ```

   Or enable via console:
   - [Cloud Functions API](https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com)
   - [Speech-to-Text API](https://console.cloud.google.com/apis/library/speech.googleapis.com)
   - [Cloud Storage API](https://console.cloud.google.com/apis/library/storage.googleapis.com)
   - [Firestore API](https://console.cloud.google.com/apis/library/firestore.googleapis.com)

3. **Set up Billing**
   - Cloud Functions and Speech-to-Text API require billing to be enabled
   - Go to [Billing](https://console.cloud.google.com/billing) in Google Cloud Console

### 2. Firebase Setup

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Initialize Firebase (if not already done)**
   ```bash
   firebase init
   # Select Functions, Firestore, and Storage
   ```

## 🔧 Configuration

### 1. Update Project Configuration

1. **Update `functions/src/config.ts`**
   ```typescript
   export const config = {
     projectId: "your-actual-project-id", // Replace with your project ID
     storageBucket: "your-project-id.appspot.com", // Replace with your bucket
     // ... other settings
   };
   ```

2. **Update Firebase Configuration**
   - Ensure your `.firebaserc` file has the correct project ID
   - Update `firebase.json` if needed

### 2. Storage Rules

Update your `storage.rules` file to allow meeting uploads:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload to their team's folder
    match /meetings/{teamId}/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    // Allow public read access to transcripts
    match /transcripts/{fileName} {
      allow read: if true;
      allow write: if false; // Only functions can write
    }
  }
}
```

### 3. Firestore Security Rules

Ensure your Firestore rules allow the functions to update meeting documents:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /meetings/{meetingId} {
      allow read, write: if request.auth != null;
      // Allow functions to update (they run with admin privileges)
    }
  }
}
```

## 🚀 Deployment

### Option 1: Using the Deployment Script

```bash
./deploy-functions.sh
```

### Option 2: Manual Deployment

```bash
cd functions
npm install
npm run build
npm run lint
firebase deploy --only functions
```

## 🧪 Testing

### 1. Test Upload Functionality

1. **Upload a test video**
   - Use the meeting upload page in your app
   - Upload a short MP4 file (< 50MB for testing)

2. **Monitor function logs**
   ```bash
   firebase functions:log
   ```

3. **Check processing status**
   - The meeting status should change from "uploaded" → "processing" → "processed"
   - Check the meeting details page for results

### 2. Test Reprocessing

1. **Manually trigger reprocessing**
   - Use the reprocess button on failed meetings
   - Or call the function directly:
   ```javascript
   import { getFunctions, httpsCallable } from 'firebase/functions';
   
   const functions = getFunctions();
   const reprocess = httpsCallable(functions, 'reprocessMeeting');
   await reprocess({ meetingId: 'your-meeting-id' });
   ```

### 3. Health Check

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const healthCheck = httpsCallable(functions, 'healthCheck');
const result = await healthCheck();
console.log(result.data); // Should show service status
```

## 📊 Monitoring

### 1. Function Logs

```bash
# View all function logs
firebase functions:log

# View specific function logs
firebase functions:log --only processMeetingUpload

# Follow logs in real-time
firebase functions:log --follow
```

### 2. Google Cloud Console

- **Functions**: [Cloud Functions Console](https://console.cloud.google.com/functions)
- **Logs**: [Cloud Logging](https://console.cloud.google.com/logs)
- **Monitoring**: [Cloud Monitoring](https://console.cloud.google.com/monitoring)

### 3. Firebase Console

- **Functions**: [Firebase Functions](https://console.firebase.google.com/project/_/functions)
- **Storage**: [Firebase Storage](https://console.firebase.google.com/project/_/storage)
- **Firestore**: [Firebase Firestore](https://console.firebase.google.com/project/_/firestore)

## 🔧 Troubleshooting

### Common Issues

1. **"FFmpeg not found" Error**
   - The functions include `@ffmpeg-installer/ffmpeg`
   - Check function logs for specific FFmpeg errors
   - Ensure sufficient memory allocation (512MB+)

2. **Speech-to-Text Quota Exceeded**
   - Check your [Google Cloud quotas](https://console.cloud.google.com/iam-admin/quotas)
   - Increase quotas if needed
   - Implement rate limiting for high volume

3. **Function Timeout**
   - Large video files may exceed the default timeout
   - Increase function timeout in deployment configuration
   - Consider chunked processing for very large files

4. **Permission Errors**
   - Ensure the Cloud Functions service account has proper permissions
   - Check IAM roles in Google Cloud Console
   - Verify Firebase Admin SDK initialization

5. **Storage Upload Failures**
   - Check storage rules
   - Verify bucket permissions
   - Ensure proper authentication

### Performance Optimization

1. **Memory Allocation**
   ```javascript
   // In your function configuration
   export const processMeetingUpload = onObjectFinalized({
     memory: "1GiB", // Increase for large files
     timeoutSeconds: 540, // 9 minutes max
     // ... other options
   }, handler);
   ```

2. **Concurrent Processing**
   - Functions automatically scale
   - Monitor concurrent executions
   - Set limits if needed to control costs

3. **Cost Optimization**
   - Monitor Speech-to-Text usage
   - Implement file size limits
   - Use appropriate audio quality settings

## 💰 Cost Considerations

### Speech-to-Text API Pricing
- **Standard model**: $0.006 per 15 seconds
- **Enhanced model**: $0.009 per 15 seconds
- **Data logging**: Additional charges may apply

### Cloud Functions Pricing
- **Invocations**: $0.40 per million
- **Compute time**: $0.0000025 per GB-second
- **Memory**: Based on allocated memory

### Storage Costs
- **Cloud Storage**: $0.020 per GB per month
- **Firestore**: $0.18 per 100K reads, $0.18 per 100K writes

### Cost Optimization Tips
1. Set file size limits (e.g., 500MB max)
2. Use appropriate audio quality (16kHz mono)
3. Implement usage monitoring and alerts
4. Consider batch processing for multiple files

## 🔒 Security Best Practices

1. **Storage Rules**
   - Restrict uploads to authenticated users
   - Validate file types and sizes
   - Implement team-based access control

2. **Function Security**
   - Use least privilege IAM roles
   - Validate input parameters
   - Implement rate limiting

3. **Data Privacy**
   - Consider transcript encryption
   - Implement data retention policies
   - Comply with privacy regulations (GDPR, etc.)

## 📚 Additional Resources

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Google Cloud Speech-to-Text](https://cloud.google.com/speech-to-text/docs)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)

## 🆘 Support

If you encounter issues:

1. Check the function logs first
2. Verify all APIs are enabled
3. Ensure billing is set up correctly
4. Check the troubleshooting section above
5. Review Google Cloud and Firebase documentation

For development questions, refer to the codebase documentation and comments in the function files. 