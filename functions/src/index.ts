/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { SpeechClient } from "@google-cloud/speech";
import type { google } from "@google-cloud/speech/build/protos/protos";
import ffmpeg, { FfprobeData } from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { config } from "./config";
import OpenAI from "openai";

// Define the secret
const openaiApiKey = defineSecret("OPENAI_API_KEY");

// Initialize Firebase Admin
admin.initializeApp();

// Lazy initialize OpenAI to avoid startup timeout
let openaiClient: OpenAI | null = null;
const getOpenAI = () => {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: openaiApiKey.value() || config.openai.apiKey,
    });
  }
  return openaiClient;
};

// Initialize Google Cloud Speech client
const speechClient = new SpeechClient();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface ActionItem {
  id: string;
  description: string;
  assignedTo?: string;
  dueDate?: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface MeetingInsights {
  summary: string;
  topicsDiscussed: string[];
  workDone: string[];
  actionItems: ActionItem[];
  decisionsMade: string[];
  followUpQuestions: string[];
  otherObservations?: string;
}

/**
 * Triggered when a file is uploaded to Firebase Storage
 * Processes meeting recordings by extracting audio and converting to text
 */
export const processMeetingUpload = onObjectFinalized(
  { 
    bucket: config.storageBucket,
    region: config.region,
    timeoutSeconds: 1800, // Increased to 30 minutes for longer videos
    memory: "2GiB", // Increased memory for larger files
    cpu: 2, // Increased CPU for faster processing
    secrets: [openaiApiKey]
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // Only process video files in the meetings folder
    if (!filePath.startsWith("meetings/") || !contentType?.startsWith("video/")) {
      logger.info("Skipping non-meeting video file", { filePath, contentType });
      return;
    }

    logger.info("Processing meeting upload", { filePath });

    try {
      // Extract meeting ID from file path (meetings/teamId/meetingId.ext)
      const pathParts = filePath.split("/");
      const fileName = pathParts[pathParts.length - 1];
      const meetingId = fileName.split(".")[0];
      const teamId = pathParts[1]; // pathParts[0] is "meetings", pathParts[1] is teamId

      // Update meeting status to processing
      await admin.firestore().collection("meetings").doc(meetingId).update({
        status: "processing",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Process the meeting using the shared helper function
      await processMeetingFile(filePath, meetingId, teamId);
    } catch (error) {
      logger.error("Error processing meeting", error);
      
      // Extract meeting ID for error update
      const pathParts = filePath.split("/");
      const fileName = pathParts[pathParts.length - 1];
      const meetingId = fileName.split(".")[0];

      // Update meeting status to failed
      await admin.firestore().collection("meetings").doc(meetingId).update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

/**
 * Extract audio from video file
 */
async function extractAudioFromVideo(videoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const audioFileName = `audio_${Date.now()}.wav`;
    const audioPath = path.join(tempDir, audioFileName);

    // Download video file from storage
    const bucket = admin.storage().bucket();
    const videoFile = bucket.file(videoPath);
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`);

    logger.info("Downloading video file for audio extraction", { videoPath, tempVideoPath });

    videoFile.download({ destination: tempVideoPath })
      .then(() => {
        logger.info("Video downloaded, starting audio extraction", { tempVideoPath, audioPath });
        
        // Extract audio using ffmpeg with optimized settings for longer files
        ffmpeg(tempVideoPath)
          .output(audioPath)
          .audioCodec("pcm_s16le")
          .audioChannels(1)
          .audioFrequency(16000)
          .audioFilters('volume=2.0') // Boost volume for better speech recognition
          .outputOptions([
            '-ac', '1', // Force mono
            '-ar', '16000', // Force sample rate
            '-f', 'wav' // Force WAV format
          ])
          .on("start", (commandLine) => {
            logger.info("FFmpeg started", { commandLine });
          })
          .on("progress", (progress) => {
            if (progress.percent) {
              logger.info("Audio extraction progress", { 
                percent: Math.round(progress.percent * 100) / 100 
              });
            }
          })
          .on("end", () => {
            logger.info("Audio extraction completed", { audioPath });
            
            // Clean up video file
            try {
              fs.unlinkSync(tempVideoPath);
            } catch (cleanupError) {
              logger.warn("Failed to cleanup temp video file", cleanupError);
            }
            
            // Verify audio file was created and has content
            try {
              const audioStats = fs.statSync(audioPath);
              if (audioStats.size === 0) {
                throw new Error("Generated audio file is empty");
              }
              logger.info("Audio file verified", { 
                audioPath, 
                sizeBytes: audioStats.size,
                sizeMB: Math.round((audioStats.size / (1024 * 1024)) * 100) / 100
              });
            } catch (verifyError) {
              logger.error("Audio file verification failed", verifyError);
              reject(new Error(`Audio extraction failed: ${verifyError}`));
              return;
            }
            
            resolve(audioPath);
          })
          .on("error", (error: Error) => {
            logger.error("FFmpeg error", error);
            
            // Clean up files on error
            try {
              if (fs.existsSync(tempVideoPath)) {
                fs.unlinkSync(tempVideoPath);
              }
              if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
              }
            } catch (cleanupError) {
              logger.warn("Failed to cleanup files after error", cleanupError);
            }
            
            reject(new Error(`Audio extraction failed: ${error.message}`));
          })
          .run();
      })
      .catch((downloadError) => {
        logger.error("Video download failed", downloadError);
        reject(new Error(`Video download failed: ${downloadError.message}`));
      });
  });
}

/**
 * Get audio duration using ffmpeg
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err: Error | null, metadata: FfprobeData) => {
      if (err) {
        logger.error("Error getting audio duration", err);
        reject(err);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(Math.round(duration));
      }
    });
  });
}

/**
 * Convert speech to text using Google Cloud Speech-to-Text
 */
async function convertSpeechToText(audioPath: string, fileSizeMB: number): Promise<string> {
  try {
    // Get audio file stats
    const audioStats = fs.statSync(audioPath);
    const audioSizeBytes = audioStats.size;
    const audioSizeMB = audioSizeBytes / (1024 * 1024);
    
    logger.info("Converting speech to text", { 
      audioPath, 
      audioSizeMB: Math.round(audioSizeMB * 100) / 100,
      originalVideoSizeMB: Math.round(fileSizeMB * 100) / 100
    });

    // Get audio duration to determine which API to use
    let audioDuration: number;
    try {
      audioDuration = await getAudioDuration(audioPath);
      logger.info("Audio duration detected", { 
        durationSeconds: audioDuration,
        durationMinutes: Math.round((audioDuration / 60) * 100) / 100
      });
    } catch (durationError) {
      logger.warn("Failed to get audio duration, defaulting to async recognition", durationError);
      // If we can't get duration, use async to be safe
      return await convertSpeechToTextAsync(audioPath);
    }

    // Google Cloud Speech API limits:
    // - Synchronous: max 60 seconds (1 minute)
    // - Asynchronous: required for longer files
    // Use async for files longer than 50 seconds to be safe
    if (audioDuration > 50 || audioSizeMB > 10) {
      logger.info("Using asynchronous speech recognition", { 
        reason: audioDuration > 50 ? "duration > 50s" : "file size > 10MB",
        duration: audioDuration,
        sizeMB: audioSizeMB
      });
      return await convertSpeechToTextAsync(audioPath);
    } else {
      logger.info("Using synchronous speech recognition", { 
        duration: audioDuration,
        sizeMB: audioSizeMB
      });
      return await convertSpeechToTextSync(audioPath);
    }
  } catch (error) {
    logger.error("Speech-to-text error", error);
    throw error;
  }
}

/**
 * Synchronous speech recognition for shorter files
 */
async function convertSpeechToTextSync(audioPath: string): Promise<string> {
  try {
    // Read audio file
    const audioBytes = fs.readFileSync(audioPath).toString("base64");

    // Configure speech recognition request
    const request = {
      audio: {
        content: audioBytes,
      },
      config: {
        encoding: "LINEAR16" as const,
        sampleRateHertz: 16000,
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        enableSpeakerDiarization: true,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 1,
          maxSpeakerCount: 10,
        },
        model: "latest_long",
      },
    };

    // Perform speech recognition
    const [response] = await speechClient.recognize(request);
    
    if (!response.results) {
      throw new Error("No speech recognition results");
    }

    return formatTranscriptResults(response.results);
  } catch (error) {
    logger.error("Sync speech-to-text error", error);
    throw error;
  }
}

/**
 * Asynchronous speech recognition for longer files
 */
async function convertSpeechToTextAsync(audioPath: string): Promise<string> {
  try {
    // Upload audio file to Cloud Storage for async processing
    const bucket = admin.storage().bucket();
    const audioFileName = `temp-audio-${Date.now()}.wav`;
    const audioFile = bucket.file(`temp/${audioFileName}`);
    
    await audioFile.save(fs.readFileSync(audioPath), {
      metadata: {
        contentType: "audio/wav",
      },
    });

    const gcsUri = `gs://${bucket.name}/temp/${audioFileName}`;
    
    logger.info("Starting async speech recognition", { gcsUri });

    // Configure async speech recognition request
    const request = {
      audio: {
        uri: gcsUri,
      },
      config: {
        encoding: "LINEAR16" as const,
        sampleRateHertz: 16000,
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        enableSpeakerDiarization: true,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 1,
          maxSpeakerCount: 10,
        },
        model: "latest_long",
      },
    };

    // Start async operation
    const [operation] = await speechClient.longRunningRecognize(request);
    
    logger.info("Waiting for async speech recognition to complete...");
    
    // Wait for operation to complete (with timeout)
    const [response] = await operation.promise();
    
    // Clean up temporary audio file
    try {
      await audioFile.delete();
    } catch (cleanupError) {
      logger.warn("Failed to cleanup temp audio file", cleanupError);
    }
    
    if (!response.results) {
      throw new Error("No speech recognition results from async operation");
    }

    logger.info("Async speech recognition completed", { 
      resultsCount: response.results.length 
    });

    return formatTranscriptResults(response.results);
  } catch (error) {
    logger.error("Async speech-to-text error", error);
    throw error;
  }
}

/**
 * Format speech recognition results into a readable transcript
 */
function formatTranscriptResults(results: google.cloud.speech.v1.ISpeechRecognitionResult[]): string {
  let fullTranscript = "";
  let currentSpeaker = -1;
  
  for (const result of results) {
    if (result.alternatives && result.alternatives[0]) {
      const alternative = result.alternatives[0];
      
      // Handle speaker diarization
      if (alternative.words && alternative.words.length > 0) {
        for (const word of alternative.words) {
          const speakerTag = word.speakerTag || 0;
          
          if (speakerTag !== currentSpeaker) {
            currentSpeaker = speakerTag;
            fullTranscript += `\n\nSpeaker ${speakerTag}: `;
          }
          
          fullTranscript += (word.word || "") + " ";
        }
      } else {
        fullTranscript += (alternative.transcript || "") + " ";
      }
    }
  }

  return fullTranscript.trim();
}

/**
 * Generate summary from transcript using simple keyword extraction
 * In production, you might want to use a more sophisticated AI service
 */
async function generateSummary(transcript: string): Promise<string> {
  try {
    // Simple summary generation - in production, use OpenAI, Vertex AI, etc.
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Take first few sentences and key phrases
    const summary = sentences.slice(0, 3).join(". ") + ".";
    
    // Add some basic analysis
    const wordCount = transcript.split(/\s+/).length;
    const speakerCount = (transcript.match(/Speaker \d+:/g) || []).length;
    
    return `${summary}\n\nMeeting Statistics:\n- Word count: ${wordCount}\n- Number of speakers: ${speakerCount}`;
  } catch (error) {
    logger.error("Summary generation error", error);
    return "Summary generation failed. Please review the transcript manually.";
  }
}

/**
 * Extract action items from transcript
 */
async function extractActionItems(transcript: string): Promise<ActionItem[]> {
  try {
    const actionItems: ActionItem[] = [];
    
    // Simple keyword-based action item extraction
    const actionKeywords = [
      "action item",
      "todo",
      "to do",
      "follow up",
      "next step",
      "assign",
      "responsible for",
      "will do",
      "need to",
      "should do"
    ];
    
    const sentences = transcript.split(/[.!?]+/);
    
    sentences.forEach((sentence, index) => {
      const lowerSentence = sentence.toLowerCase();
      
      if (actionKeywords.some(keyword => lowerSentence.includes(keyword))) {
        actionItems.push({
          id: `action_${index}`,
          description: sentence.trim(),
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });
    
    return actionItems;
  } catch (error) {
    logger.error("Action item extraction error", error);
    return [];
  }
}

/**
 * Get video duration using ffmpeg
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const bucket = admin.storage().bucket();
    const videoFile = bucket.file(videoPath);
    const tempVideoPath = path.join(tempDir, `duration_${Date.now()}.mp4`);

    videoFile.download({ destination: tempVideoPath })
      .then(() => {
        ffmpeg.ffprobe(tempVideoPath, (err: Error | null, metadata: FfprobeData) => {
          // Clean up temp file
          fs.unlinkSync(tempVideoPath);
          
          if (err) {
            reject(err);
          } else {
            const duration = metadata.format.duration || 0;
            resolve(Math.round(duration));
          }
        });
      })
      .catch(reject);
  });
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles(audioPath: string): Promise<void> {
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
  } catch (error) {
    logger.error("Cleanup error", error);
  }
}

/**
 * Manual reprocessing function for failed meetings
 */
export const reprocessMeeting = onCall(
  { 
    region: "us-central1",
    timeoutSeconds: 1800, // Increased to 30 minutes like the main processing function
    memory: "2GiB", // Increased memory for reprocessing
    cpu: 2, // Increased CPU
    secrets: [openaiApiKey]
  },
  async (request) => {
    const { meetingId } = request.data;
    
    if (!meetingId) {
      throw new Error("Meeting ID is required");
    }
    
    try {
      // Get meeting document
      const meetingDoc = await admin.firestore().collection("meetings").doc(meetingId).get();
      
      if (!meetingDoc.exists) {
        throw new Error("Meeting not found");
      }
      
      const meetingData = meetingDoc.data();
      
      if (!meetingData?.recordingUrl) {
        throw new Error("No recording URL found for this meeting");
      }
      
      // Check if meeting is already being processed
      if (meetingData.status === 'processing') {
        throw new Error("Meeting is already being processed");
      }
      
      // Extract file path from URL or use direct path
      let filePath: string;
      
      if (meetingData.recordingUrl.startsWith('gs://')) {
        // Direct GCS path
        filePath = meetingData.recordingUrl.replace('gs://' + admin.storage().bucket().name + '/', '');
      } else if (meetingData.recordingUrl.includes('/o/')) {
        // Firebase Storage URL
        const url = new URL(meetingData.recordingUrl);
        filePath = decodeURIComponent(url.pathname.split("/o/")[1].split("?")[0]);
      } else {
        throw new Error("Invalid recording URL format");
      }
      
      // Verify file exists
      const bucket = admin.storage().bucket();
      const videoFile = bucket.file(filePath);
      const [exists] = await videoFile.exists();
      
      if (!exists) {
        throw new Error("Recording file not found in storage");
      }
      
      logger.info("Manually reprocessing meeting", { meetingId, filePath });
      
      // Update status to processing
      await admin.firestore().collection("meetings").doc(meetingId).update({
        status: "processing",
        error: admin.firestore.FieldValue.delete(), // Clear previous error
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Extract teamId from file path (meetings/teamId/meetingId.ext)
      const pathParts = filePath.split("/");
      const teamId = pathParts[1]; // pathParts[0] is "meetings", pathParts[1] is teamId
      
      // Process the meeting using the shared helper function
      await processMeetingFile(filePath, meetingId, teamId);
      
      return { 
        success: true, 
        message: "Meeting reprocessed successfully",
        meetingId,
        filePath
      };
    } catch (error) {
      logger.error("Reprocessing error", error);
      
      // Update meeting status to failed
      await admin.firestore().collection("meetings").doc(meetingId).update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      throw new Error(`Failed to reprocess meeting: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Helper function to process meeting files (used by both storage trigger and manual reprocessing)
 */
async function processMeetingFile(filePath: string, meetingId: string, teamId: string): Promise<void> {
  try {
    // Check file size before processing
    const bucket = admin.storage().bucket();
    const videoFile = bucket.file(filePath);
    const [metadata] = await videoFile.getMetadata();
    const fileSizeBytes = typeof metadata.size === 'string' ? parseInt(metadata.size) : (metadata.size || 0);
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    
    logger.info("Processing video file", { 
      filePath, 
      fileSizeMB: Math.round(fileSizeMB * 100) / 100,
      meetingId 
    });

    // Extract audio from video
    const audioPath = await extractAudioFromVideo(filePath);
    
    // Convert speech to text (with improved handling for longer files)
    const transcript = await convertSpeechToText(audioPath, fileSizeMB);
    
    // Generate basic summary and action items
    const summary = await generateSummary(transcript);
    const actionItems = await extractActionItems(transcript);
    
    // Generate AI insights using OpenAI
    let insights: MeetingInsights | null = null;
    try {
      insights = await generateMeetingInsights(transcript);
      logger.info("Generated AI insights successfully");
    } catch (error) {
      logger.error("Failed to generate AI insights:", error);
      // Continue without insights if OpenAI fails
    }

    // Get video duration
    const duration = await getVideoDuration(filePath);

    // Upload transcript to storage
    const transcriptFileName = `${meetingId}_transcript.txt`;
    const transcriptPath = `${config.paths.transcripts}${meetingId}/${transcriptFileName}`;
    const transcriptFile = admin.storage().bucket().file(transcriptPath);
    
    await transcriptFile.save(transcript, {
      metadata: {
        contentType: "text/plain",
        metadata: {
          meetingId,
          createdAt: new Date().toISOString(),
        },
      },
    });

    // Update meeting document with results
    const updateData: Record<string, unknown> = {
      status: "processed",
      transcript,
      transcriptUrl: transcriptPath,
      summary,
      actionItems,
      duration,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add AI insights if available
    if (insights) {
      updateData.aiSummary = insights.summary;
      updateData.topicsDiscussed = insights.topicsDiscussed;
      updateData.workDone = insights.workDone;
      updateData.aiActionItems = insights.actionItems;
      updateData.decisionsMade = insights.decisionsMade;
      updateData.followUpQuestions = insights.followUpQuestions;
      updateData.otherObservations = insights.otherObservations;
    }

    await admin.firestore().collection("meetings").doc(meetingId).update(updateData);

    // Clean up temporary files
    await cleanupTempFiles(audioPath);

    logger.info("Meeting processing completed", { meetingId, duration, fileSizeMB });

    // Remove automatic Slack notification - now manual
    // Get the full meeting data for Slack notification
    // const meetingDoc = await admin.firestore().collection("meetings").doc(meetingId).get();
    // const meetingData = meetingDoc.data();
    
    // Send Slack notification
    // if (meetingData) {
    //   await sendSlackNotification(meetingData, insights, teamId);
    // }
  } catch (error) {
    logger.error("Error processing meeting file", error);
    
    // Update meeting status to failed
    await admin.firestore().collection("meetings").doc(meetingId).update({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    throw error;
  }
}

/**
 * Health check function
 */
export const healthCheck = onCall(
  { 
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async () => {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        firestore: "connected",
        storage: "connected",
        speech: "connected",
      },
    };
  }
);

/**
 * Manage Slack integrations
 */
export const manageSlackIntegration = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (request) => {
    const { action, teamId, channelId, channelName, webhookUrl, userId } = request.data;
    
    if (!teamId || !userId) {
      throw new Error("Team ID and User ID are required");
    }
    
    try {
      switch (action) {
        case "create": {
          if (!channelId || !channelName || !webhookUrl) {
            throw new Error("Channel ID, channel name, and webhook URL are required");
          }
          
          // Validate webhook URL format
          if (!webhookUrl.includes("hooks.slack.com")) {
            throw new Error("Invalid Slack webhook URL");
          }
          
          // Check if user has permission to manage team integrations
          const teamDoc = await admin.firestore().collection("teams").doc(teamId).get();
          if (!teamDoc.exists) {
            throw new Error("Team not found");
          }
          
          const teamData = teamDoc.data();
          if (teamData?.ownerId !== userId && !teamData?.members?.includes(userId)) {
            throw new Error("Insufficient permissions");
          }
          
          // Create or update Slack integration
          const integrationRef = admin.firestore().collection("slackIntegrations").doc();
          const timestamp = admin.firestore.FieldValue.serverTimestamp();
          
          const integration = {
            id: integrationRef.id,
            teamId,
            channelId,
            channelName,
            webhookUrl,
            isActive: true,
            createdBy: userId,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          
          await integrationRef.set(integration);
          
          // Update team document
          await admin.firestore().collection("teams").doc(teamId).update({
            slackIntegration: integration,
            updatedAt: timestamp
          });
          
          return { success: true, integrationId: integrationRef.id };
        }
        
        case "update": {
          const { integrationId, ...updates } = request.data;
          if (!integrationId) {
            throw new Error("Integration ID is required for update");
          }
          
          const integrationDoc = await admin.firestore().collection("slackIntegrations").doc(integrationId).get();
          if (!integrationDoc.exists) {
            throw new Error("Integration not found");
          }
          
          const integrationData = integrationDoc.data();
          if (integrationData?.teamId !== teamId) {
            throw new Error("Integration does not belong to this team");
          }
          
          // Check permissions
          const teamDocForUpdate = await admin.firestore().collection("teams").doc(teamId).get();
          const teamDataForUpdate = teamDocForUpdate.data();
          if (teamDataForUpdate?.ownerId !== userId && !teamDataForUpdate?.members?.includes(userId)) {
            throw new Error("Insufficient permissions");
          }
          
          const updateData = {
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await admin.firestore().collection("slackIntegrations").doc(integrationId).update(updateData);
          
          // Update team document
          await admin.firestore().collection("teams").doc(teamId).update({
            slackIntegration: {
              ...integrationData,
              ...updateData
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          return { success: true };
        }
        
        case "test": {
          // Get team's Slack integration
          const teamDoc = await admin.firestore().collection("teams").doc(teamId).get();
          
          if (!teamDoc.exists) {
            throw new Error("Team not found");
          }
          
          const teamData = teamDoc.data();
          const slackIntegration = teamData?.slackIntegration;
          
          if (!slackIntegration || !slackIntegration.isActive) {
            throw new Error("No active Slack integration found");
          }
          
          // Check permissions
          if (teamData?.ownerId !== userId && !teamData?.members?.includes(userId)) {
            throw new Error("Insufficient permissions");
          }
          
          // Send test message
          const testPayload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "🧪 HuddleAI Test Message",
                  emoji: true
                }
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `Hello from HuddleAI! 👋\n\nThis is a test message to confirm your Slack integration is working correctly.\n\n*Team:* ${teamData.name || 'Unknown'}\n*Channel:* #${slackIntegration.channelName}\n*Time:* ${new Date().toLocaleString()}`
                }
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "✅ Your Slack integration is configured properly! You'll receive meeting summaries here when meetings are processed."
                }
              }
            ],
            text: "HuddleAI Test Message" // Fallback text
          };
          
          const response = await fetch(slackIntegration.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload)
          });
          
          if (!response.ok) {
            throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
          }
          
          logger.info("Slack test message sent successfully", { 
            teamId, 
            channelName: slackIntegration.channelName 
          });
          
          return { success: true, message: "Test message sent successfully!" };
        }
        
        case "delete": {
          // Get team's Slack integration
          const teamDoc = await admin.firestore().collection("teams").doc(teamId).get();
          
          if (!teamDoc.exists) {
            throw new Error("Team not found");
          }
          
          const teamData = teamDoc.data();
          const slackIntegration = teamData?.slackIntegration;
          
          if (!slackIntegration) {
            throw new Error("No Slack integration found");
          }
          
          // Check permissions
          if (teamData?.ownerId !== userId && !teamData?.members?.includes(userId)) {
            throw new Error("Insufficient permissions");
          }
          
          // Delete from slackIntegrations collection
          if (slackIntegration.id) {
            await admin.firestore().collection("slackIntegrations").doc(slackIntegration.id).delete();
          }
          
          // Remove from team document
          await admin.firestore().collection("teams").doc(teamId).update({
            slackIntegration: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          logger.info("Slack integration deleted successfully", { 
            teamId, 
            integrationId: slackIntegration.id 
          });
          
          return { success: true, message: "Slack integration removed successfully!" };
        }
        
        default:
          throw new Error("Invalid action. Supported actions: create, update, test, delete");
      }
    } catch (error) {
      logger.error("Slack integration management error", { 
        error: error instanceof Error ? error.message : error,
        action,
        teamId,
        userId 
      });
      throw error;
    }
  }
);

/**
 * Generate meeting insights using OpenAI
 */
async function generateMeetingInsights(transcript: string): Promise<MeetingInsights> {
  try {
    const prompt = `You are an intelligent assistant helping a team organize and summarize their meetings.

You are given the transcript of a team meeting. Please analyze the full content and return a structured summary that includes the following sections:

1. **Meeting Summary**: A high-level, concise summary (2–4 sentences) describing the overall purpose of the meeting and what was accomplished.

2. **Topics Discussed**: A bullet-point list of all major topics or themes covered, grouped if appropriate (e.g., "Product Development," "Team Updates," "Customer Feedback").

3. **Work Already Done**: Identify and list any completed tasks or accomplishments that were mentioned during the meeting. Include who completed them if available.

4. **Action Items**: Provide a list of tasks or next steps that need to be done, ideally with the person responsible and any deadlines mentioned. Format like:
   - [ ] Task description — Assigned to: Name (Due: date if specified)

5. **Decisions Made**: List any decisions made in the meeting. These might include approvals, rejections, strategy changes, or priorities.

6. **Follow-up Questions or Concerns**: Include any unanswered questions, points of confusion, or things that require follow-up after the meeting.

7. **Other Observations** (optional): Anything notable from the meeting such as tone changes, conflicts, delays, or repeated emphasis.

Please return your response as a JSON object with the following structure:
{
  "summary": "string",
  "topicsDiscussed": ["string"],
  "workDone": ["string"],
  "actionItems": [{"id": "string", "description": "string", "assignedTo": "string", "dueDate": "string", "status": "pending"}],
  "decisionsMade": ["string"],
  "followUpQuestions": ["string"],
  "otherObservations": "string"
}

Here is the transcript:

---
${transcript}
---`;

    const completion = await getOpenAI().chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes meeting transcripts and provides structured summaries. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: config.openai.maxTokens,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }

    // Clean the response to handle markdown code blocks
    let cleanedResponse = response.trim();
    
    // Remove markdown code blocks if present
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Parse the JSON response
    const insights: MeetingInsights = JSON.parse(cleanedResponse);
    
    // Ensure action items have proper structure
    insights.actionItems = insights.actionItems.map((item, index) => ({
      id: item.id || `action-${index + 1}`,
      description: item.description,
      assignedTo: item.assignedTo || "Unassigned",
      dueDate: item.dueDate || "",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    return insights;
  } catch (error) {
    logger.error("Error generating meeting insights:", error);
    throw new Error(`Failed to generate meeting insights: ${error}`);
  }
}

/**
 * Create simplified Slack message blocks
 */
async function createSlackMessage(
  meeting: Record<string, unknown>, 
  customMessage?: string
): Promise<Record<string, unknown>[]> {
  // Format the meeting duration
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes > 0 ? remainingMinutes + 'm' : ''}`;
    }
    return `${minutes} mins`;
  };
  
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📋 Meeting Summary",
        emoji: true
      }
    }
  ];
  
  // Custom message if provided
  if (customMessage) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: customMessage
      }
    });
    blocks.push({
      type: "divider"
    });
  }
  
  // Meeting details
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Meeting:* ${meeting.title || 'Unknown'}`
      },
      {
        type: "mrkdwn",
        text: `*Duration:* ${formatDuration((meeting.duration as number) || 0)}`
      },
      {
        type: "mrkdwn",
        text: `*Date:* ${(meeting.date as { toDate?: () => Date })?.toDate ? new Date((meeting.date as { toDate: () => Date }).toDate()).toLocaleDateString() : 'Unknown'}`
      },
      {
        type: "mrkdwn",
        text: `*Uploaded by:* ${meeting.uploadedByName || 'Unknown'}`
      }
    ]
  });
  
  // AI Summary (concise)
  if (meeting.aiSummary) {
    const summary = (meeting.aiSummary as string).length > 300 
      ? (meeting.aiSummary as string).substring(0, 300) + "..." 
      : meeting.aiSummary as string;
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📝 Summary:*\n${summary}`
      }
    });
  }
  
  // Key action items (max 3)
  if (meeting.aiActionItems && Array.isArray(meeting.aiActionItems) && meeting.aiActionItems.length > 0) {
    const actionItems = meeting.aiActionItems.slice(0, 3);
    const actionText = actionItems
      .map((item: ActionItem) => `• ${item.description}${item.assignedTo && item.assignedTo !== 'Unassigned' ? ` (${item.assignedTo})` : ''}`)
      .join('\n');
    
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✅ Key Action Items:*\n${actionText}${meeting.aiActionItems.length > 3 ? `\n_...and ${meeting.aiActionItems.length - 3} more_` : ''}`
      }
    });
  }
  
  // View meeting button
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View Full Meeting",
          emoji: true
        },
        url: `${config.frontendUrl}/meeting-details?id=${meeting.id}`,
        style: "primary"
      }
    ]
  });
  
  return blocks;
}

/**
 * Send meeting notification to Slack manually
 */
export const sendMeetingToSlack = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (request) => {
    const { meetingId, teamId, userId, customMessage } = request.data;
    
    if (!meetingId || !teamId || !userId) {
      throw new Error("Meeting ID, Team ID, and User ID are required");
    }
    
    try {
      // Check permissions
      const teamDoc = await admin.firestore().collection("teams").doc(teamId).get();
      if (!teamDoc.exists) {
        throw new Error("Team not found");
      }
      
      const teamData = teamDoc.data();
      if (teamData?.ownerId !== userId && !teamData?.members?.includes(userId)) {
        throw new Error("Insufficient permissions");
      }
      
      // Get Slack integration
      const slackIntegration = teamData?.slackIntegration;
      if (!slackIntegration || !slackIntegration.isActive) {
        throw new Error("No active Slack integration found");
      }
      
      // Get meeting data
      const meetingDoc = await admin.firestore().collection("meetings").doc(meetingId).get();
      if (!meetingDoc.exists) {
        throw new Error("Meeting not found");
      }
      
      const meetingData = meetingDoc.data();
      
      if (!meetingData) {
        throw new Error("Meeting data not found");
      }
      
      // Create simplified Slack message
      const blocks = await createSlackMessage(meetingData, customMessage);
      
      const payload = {
        blocks,
        text: `Meeting summary: ${meetingData?.title}` // Fallback text
      };
      
      // Send to Slack
      const response = await fetch(slackIntegration.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }
      
      // Update meeting with Slack notification status
      await admin.firestore().collection("meetings").doc(meetingId).update({
        slackNotificationSent: true,
        slackNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        slackNotificationSentBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info("Manual Slack notification sent successfully", { 
        teamId, 
        meetingId,
        channelName: slackIntegration.channelName,
        sentBy: userId
      });
      
      return { 
        success: true, 
        message: "Meeting summary sent to Slack successfully!",
        channelName: slackIntegration.channelName
      };
      
    } catch (error) {
      logger.error("Failed to send manual Slack notification", { 
        error: error instanceof Error ? error.message : error,
        teamId,
        meetingId,
        userId 
      });
      throw error;
    }
  }
);
