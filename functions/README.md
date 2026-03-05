# HuddleAI Cloud Functions

This directory contains Google Cloud Functions for processing meeting recordings, including speech-to-text conversion and summarization.

## Features

- **Automatic Processing**: Triggered when video files are uploaded to Firebase Storage
- **Audio Extraction**: Extracts audio from MP4 video files using FFmpeg
- **Speech-to-Text**: Converts audio to text using Google Cloud Speech-to-Text API
- **Speaker Diarization**: Identifies different speakers in the meeting
- **Summary Generation**: Creates meeting summaries from transcripts
- **Action Item Extraction**: Automatically identifies action items from conversations
- **Error Handling**: Robust error handling with status updates

## Setup

### Prerequisites

1. **Google Cloud Project** with the following APIs enabled:
   - Cloud Functions API
   - Cloud Speech-to-Text API
   - Firebase Storage API
   - Firestore API

2. **Firebase CLI** installed and authenticated:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Node.js 22** (as specified in package.json)

### Installation

1. Navigate to the functions directory:
   ```bash
   cd functions
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Update configuration in `src/config.ts`:
   - Replace `your-project-id` with your actual Firebase project ID
   - Adjust other settings as needed

### Environment Setup

The functions automatically detect the project ID from the environment variable `GCLOUD_PROJECT` when deployed. For local development, you can set this manually.

## Functions

### `processMeetingUpload`

**Trigger**: Storage object finalized (when a file is uploaded)
**Purpose**: Main processing function that handles the entire pipeline

**Process Flow**:
1. Detects video file uploads in the `meetings/` folder
2. Updates meeting status to "processing"
3. Extracts audio from video using FFmpeg
4. Converts speech to text with speaker diarization
5. Generates summary and extracts action items
6. Uploads transcript to storage
7. Updates meeting document with results
8. Cleans up temporary files

### `reprocessMeeting`

**Trigger**: Callable function
**Purpose**: Manually reprocess failed meetings

**Usage**:
```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const reprocessMeeting = httpsCallable(functions, 'reprocessMeeting');

await reprocessMeeting({ meetingId: 'your-meeting-id' });
```

### `healthCheck`

**Trigger**: Callable function
**Purpose**: Check the health status of the functions

## File Structure

```
meetings/
├── teamId/
│   └── meetingId.mp4    # Original video files
└── ...

transcripts/
├── meetingId.txt        # Generated transcripts
└── ...
```

## Configuration

### Speech-to-Text Settings

The functions use the following Speech-to-Text configuration:
- Language: English (US)
- Model: `latest_long` (optimized for longer audio)
- Speaker diarization: Enabled (1-10 speakers)
- Automatic punctuation: Enabled
- Word time offsets: Enabled

### Audio Processing

Videos are converted to:
- Format: WAV
- Sample rate: 16kHz
- Channels: Mono
- Encoding: PCM 16-bit

## Deployment

### Deploy All Functions

```bash
npm run deploy
```

### Deploy Specific Function

```bash
firebase deploy --only functions:processMeetingUpload
```

### Local Development

```bash
npm run serve
```

This starts the Firebase emulator for local testing.

## Monitoring

### Logs

View function logs:
```bash
npm run logs
```

Or in the Firebase Console:
- Go to Functions section
- Click on a function name
- View the Logs tab

### Error Handling

The functions include comprehensive error handling:
- Failed meetings are marked with status "failed"
- Error messages are stored in the meeting document
- Temporary files are cleaned up even on errors
- Detailed logging for debugging

## Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - The functions include `@ffmpeg-installer/ffmpeg` which should handle this automatically
   - Check the logs for FFmpeg-related errors

2. **Speech-to-Text quota exceeded**
   - Check your Google Cloud quotas and billing
   - Consider implementing rate limiting for large volumes

3. **Storage permissions**
   - Ensure the Cloud Functions service account has proper Storage permissions
   - Check IAM roles in Google Cloud Console

4. **Memory/timeout issues**
   - Large video files may require increased memory allocation
   - Adjust function configuration in `firebase.json` if needed

### Performance Optimization

For production use, consider:
- Implementing chunked processing for very large files
- Using Cloud Storage transfer service for large uploads
- Implementing retry logic with exponential backoff
- Adding monitoring and alerting

## Security

- Functions run with Firebase Admin SDK privileges
- Transcripts are made publicly readable (adjust as needed)
- Consider implementing authentication for callable functions
- Review IAM permissions regularly

## Cost Considerations

- Speech-to-Text API charges per minute of audio
- Cloud Functions charges for execution time and memory usage
- Storage costs for transcripts and temporary files
- Consider implementing usage limits and monitoring 