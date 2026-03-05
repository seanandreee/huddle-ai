# HuddleAI - AI-Powered Meeting Assistant

HuddleAI is an intelligent meeting assistant that automatically processes, transcribes, and summarizes your team meetings, making them more productive and actionable.

## 🌟 Key Features

### 🎥 Automatic Meeting Processing
- Upload meeting recordings (up to 1GB)
- Automatic audio extraction and processing
- Speech-to-text conversion with speaker identification
- AI-powered meeting summarization
- Action item extraction and tracking

### 📝 Smart Summaries
- Comprehensive meeting summaries
- Key topics discussed
- Action items with assignments
- Important decisions made
- Follow-up questions and next steps

### 🔄 Slack Integration
- Automatic notifications when meetings are processed
- Rich message format with meeting details
- Direct links to full meeting information
- Customizable notification settings
- Team-specific channel configuration

### 👥 Team Collaboration
- Team-based workspace organization
- Member management and permissions
- Shared meeting history
- Collaborative action item tracking
- Team-specific settings and integrations

## 🚀 Getting Started

### Prerequisites
- Node.js & npm installed
- Google Cloud account (for deployment)
- Firebase account (for hosting)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd huddleai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with your Firebase configuration:
```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

4. Start the development server:
```bash
npm run dev
```

## 🛠️ Technical Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn-ui
- **Backend**: Firebase Cloud Functions
- **Database**: Firestore
- **Storage**: Firebase Storage
- **Authentication**: Firebase Auth
- **AI/ML**: Google Cloud Speech-to-Text, OpenAI GPT-4

## 🔧 Cloud Functions Setup

The application uses Google Cloud Functions for processing meeting recordings. To set up:

1. Enable required APIs in Google Cloud Console:
   - Cloud Functions API
   - Speech-to-Text API
   - Firebase Storage API
   - Firestore API

2. Deploy functions:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

## 📱 Features in Detail

### Meeting Processing
- Supports video files up to 1GB
- Automatic audio extraction using FFmpeg
- Speaker diarization for multiple participants
- Intelligent summarization using GPT-4
- Action item extraction and assignment

### Slack Integration
- Automatic meeting notifications
- Rich message formatting
- Customizable notification settings
- Team-specific channel configuration
- Test message functionality

### User Management
- Email/password authentication
- Team creation and management
- Member invitations and permissions
- Profile management
- Secure access control

## 🔒 Security

- Firebase Authentication for user management
- Secure storage of API keys and credentials
- Role-based access control
- Secure file uploads and processing
- Protected API endpoints

## 🚀 Deployment

1. Build the application:
```bash
npm run build
```

2. Deploy to Firebase:
```bash
firebase deploy
```

## 📚 Documentation

For detailed documentation on specific features:
- [Cloud Functions Setup](functions/README.md)
- [Slack Integration](SLACK_INTEGRATION_README.md)
- [Firebase Authentication](src/docs/FirebaseAuth.md)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, please contact the HuddleAI team or create an issue in the project repository.
