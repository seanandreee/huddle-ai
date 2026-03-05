// Configuration for Cloud Functions
export const config = {
  // Your Firebase project ID
  projectId: process.env.GCLOUD_PROJECT || "huddleai-a812c",
  
  // Storage bucket name
  storageBucket: process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.firebasestorage.app` : "huddleai-a812c.firebasestorage.app",
  
  // Region for functions
  region: "us-central1",
  
  // Frontend URL for links in notifications
  frontendUrl: process.env.FRONTEND_URL || "https://huddleai-a812c.web.app",
  
  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: "gpt-4o-mini",
    maxTokens: 4000,
  },
  
  // Speech-to-Text configuration
  speechConfig: {
    languageCode: "en-US",
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: true,
    enableSpeakerDiarization: true,
    model: "latest_long",
    maxSpeakers: 10,
  },
  
  // Audio processing configuration
  audioConfig: {
    sampleRate: 16000,
    channels: 1,
    codec: "pcm_s16le",
  },
  
  // File paths
  paths: {
    meetings: "meetings/",
    transcripts: "transcripts/",
    tempDir: "/tmp",
  },
}; 