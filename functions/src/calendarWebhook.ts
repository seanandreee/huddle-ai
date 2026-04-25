import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { generateMeetingInsights } from "./index";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Calendar Webhook Handler
 * 
 * Google Calendar sends push notifications here when events change.
 * We look for events that have ended and have recording or transcript attachments.
 */
export const calendarWebhook = onRequest(
  async (req, res) => {
    // Acknowledge receipt quickly as required by Google
    res.status(200).send("OK");

    try {
      const channelId = req.headers["x-goog-channel-id"] as string;
      const resourceState = req.headers["x-goog-resource-state"] as string;

      if (!channelId) {
        logger.warn("Received webhook without channel ID");
        return;
      }

      if (resourceState === "sync") {
        logger.info(`Sync notification received for channel ${channelId}`);
        return;
      }

      const db = admin.firestore();
      
      // Look up the user who owns this channel
      const integrationsSnapshot = await db.collectionGroup("integrations")
        .where("googleChannelId", "==", channelId)
        .limit(1)
        .get();

      if (integrationsSnapshot.empty) {
        logger.warn(`No integration found for channel ${channelId}`);
        return;
      }

      const integrationDoc = integrationsSnapshot.docs[0];
      const integrationData = integrationDoc.data();
      const userId = integrationDoc.ref.parent.parent?.id;

      if (!userId || !integrationData.encryptedRefreshToken) {
        logger.error("Missing userId or encryptedRefreshToken");
        return;
      }

      // 1. Decrypt token and setup OAuth client
      const crypto = await import("crypto");
      const { iv, encrypted, authTag } = JSON.parse(integrationData.encryptedRefreshToken);
      const key = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY!, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
      decipher.setAuthTag(Buffer.from(authTag, "hex"));
      const refreshToken = decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // 2. Fetch recent changes from Calendar
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      
      const syncToken = integrationData.calendarSyncToken;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listParams: any = {
        calendarId: "primary",
        singleEvents: true,
      };

      if (syncToken) {
        listParams.syncToken = syncToken;
      } else {
        // If no sync token, just get events from the last 2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        listParams.timeMin = twoHoursAgo.toISOString();
        listParams.timeMax = new Date().toISOString();
      }

      let response;
      try {
        response = await calendar.events.list(listParams);
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (err.code === 410) {
          // Sync token invalid, clear it and retry
          logger.warn("Sync token invalid, fetching without it");
          delete listParams.syncToken;
          response = await calendar.events.list(listParams);
        } else {
          throw err;
        }
      }

      const events = response.data.items || [];
      const nextSyncToken = response.data.nextSyncToken;

      // Save the new sync token
      if (nextSyncToken && nextSyncToken !== syncToken) {
        await integrationDoc.ref.update({ calendarSyncToken: nextSyncToken });
      }

      // 3. Process events
      for (const event of events) {
        // Only process events that have ended
        if (event.status === "cancelled") continue;
        
        const now = new Date();
        const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;
        
        if (!endTime || endTime > now) continue;

        // Check if it's a Google Meet meeting
        if (!event.hangoutLink) continue;

        // Check for attachments
        if (!event.attachments || event.attachments.length === 0) continue;

        let transcriptFile = null;
        let videoFile = null;

        for (const attachment of event.attachments) {
          if (attachment.mimeType?.includes("text/vtt") || attachment.mimeType?.includes("text/plain")) {
            transcriptFile = attachment;
          } else if (attachment.mimeType?.includes("video/mp4")) {
            videoFile = attachment;
          }
        }

        if (transcriptFile) {
          logger.info(`Found transcript for event ${event.id}. Triggering Transcript-First flow.`);
          try {
            const drive = google.drive({ version: "v3", auth: oauth2Client });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileRes: any = await drive.files.get(
              { fileId: transcriptFile.fileId as string, alt: "media" },
              { responseType: "text" }
            );
            const transcriptText = fileRes.data as string;
            
            const insights = await generateMeetingInsights(transcriptText);
            
            // Generate a random meeting ID
            const meetingId = db.collection("meetings").doc().id;
            
            const meetingData = {
              title: event.summary || "Google Meet",
              duration: 0, // Hard to calculate accurate duration without processing video
              uploadedBy: userId,
              uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
              status: "completed",
              transcript: transcriptText,
              summary: insights.summary,
              topicsDiscussed: insights.topicsDiscussed || [],
              decisionsMade: insights.decisionsMade || [],
              actionItems: insights.actionItems || [],
              workspaceId: integrationData.workspaceId === "personal" ? null : integrationData.workspaceId,
              workspaceType: integrationData.workspaceId === "personal" ? "personal" : "team",
              teamId: integrationData.workspaceId === "personal" ? null : integrationData.workspaceId,
              source: "Google Meet (Transcript)",
            };
            
            await db.collection("meetings").doc(meetingId).set(meetingData);
            logger.info(`Successfully ingested and processed transcript for event ${event.id}`);
            
          } catch (e) {
            logger.error("Failed to process transcript from Google Drive", e);
          }
        } else if (videoFile) {
          logger.info(`Found video recording for event ${event.id}. Triggering Recording Fallback flow.`);
          // TODO: Download MP4 and trigger processMeetingUpload
        }
      }
    } catch (error) {
      logger.error("Error processing calendar webhook", error);
    }
  }
);
