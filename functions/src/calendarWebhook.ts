/**
 * calendarWebhook.ts
 *
 * Phase 3 — Google Meet Auto-Ingest Pipeline
 *
 * Receives Google Calendar push notifications (via watch channels registered
 * during the OAuth callback). For each ended Google Meet event:
 *
 *   Strategy 1 — Transcript-First (preferred):
 *     • Scan Drive attachments for a .vtt or transcript .txt file.
 *     • Download and pass raw text directly to generateMeetingInsights (GPT-4).
 *     • Write a completed meeting document — no Speech-to-Text cost.
 *
 *   Strategy 2 — Recording Fallback:
 *     • If no transcript found, scan attachments for an .mp4 recording.
 *     • Download the MP4 from Drive, upload it to Firebase Storage under the
 *       canonical meetings/{meetingId}/{meetingId}.mp4 path so that the
 *       existing onObjectFinalized trigger (processMeetingUpload) picks it up
 *       and runs the full Whisper → GPT-4 pipeline automatically.
 *
 * Deduplication: a Firestore document at
 *   users/{userId}/integrations/google/processedEvents/{calendarEventId}
 * prevents the same event from being ingested twice across multiple webhook
 * notifications for the same change.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";
import { generateMeetingInsights } from "./index";
import { buildOAuth2Client } from "./googleHelpers";

// ── Secrets (IAM accessor role pre-granted on all three) ─────────────────────
const clientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const clientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarAttachment {
  fileId?: string | null;
  mimeType?: string | null;
  title?: string | null;
  fileUrl?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a refreshed OAuth2 client from the user's stored encrypted refresh token.
 */
function buildLocalOAuth2Client(
  encryptedRefreshToken: string,
  keyHex: string
) {
  return buildOAuth2Client(
    clientId.value(),
    clientSecret.value(),
    encryptedRefreshToken,
    keyHex
  );
}

/**
 * Download a file from Google Drive and return its text content.
 * Handles both VTT (text/vtt) and plain text (text/plain) formats.
 */
async function downloadDriveTextFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drive: any,
  fileId: string
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return res.data as string;
}

/**
 * Download a binary file (MP4) from Google Drive to a local temp path.
 * Returns the temp file path.
 */
async function downloadDriveBinaryFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drive: any,
  fileId: string,
  destPath: string
): Promise<void> {
  const dest = fs.createWriteStream(destPath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  await new Promise<void>((resolve, reject) => {
    res.data.pipe(dest);
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });
}

/**
 * Calculate meeting duration in seconds from calendar event start/end.
 */
function calcDuration(
  start?: { dateTime?: string | null } | null,
  end?: { dateTime?: string | null } | null
): number {
  if (!start?.dateTime || !end?.dateTime) return 0;
  return Math.round(
    (new Date(end.dateTime).getTime() - new Date(start.dateTime).getTime()) / 1000
  );
}

/**
 * Return workspace fields for the meeting document based on the workspaceId
 * stored in the integration doc.
 */
function resolveWorkspaceFields(workspaceId: string) {
  if (!workspaceId || workspaceId === "personal") {
    return { workspaceId: null, workspaceType: "personal", teamId: null };
  }
  return { workspaceId, workspaceType: "team", teamId: workspaceId };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

export const calendarWebhook = onRequest(
  { secrets: [clientId, clientSecret, encryptionKey], timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    // Google requires a fast 2xx ack — do it immediately.
    res.status(200).send("OK");

    try {
      const channelId = req.headers["x-goog-channel-id"] as string;
      const resourceState = req.headers["x-goog-resource-state"] as string;

      // Initial sync ping — safe to ignore.
      if (resourceState === "sync") {
        logger.info(`[calendarWebhook] sync ping for channel ${channelId}`);
        return;
      }

      if (!channelId) {
        logger.warn("[calendarWebhook] Missing x-goog-channel-id header");
        return;
      }

      const db = admin.firestore();

      // ── 1. Resolve which user owns this channel ───────────────────────────
      const snap = await db
        .collectionGroup("integrations")
        .where("googleChannelId", "==", channelId)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.warn(`[calendarWebhook] No integration found for channel ${channelId}`);
        return;
      }

      const integrationDoc = snap.docs[0];
      const integration = integrationDoc.data();
      const userId = integrationDoc.ref.parent.parent?.id;

      if (!userId || !integration.encryptedRefreshToken) {
        logger.error("[calendarWebhook] Missing userId or encryptedRefreshToken");
        return;
      }

      // ── 2. Mint a fresh access token ──────────────────────────────────────
      const oauth2Client = buildLocalOAuth2Client(
        integration.encryptedRefreshToken,
        encryptionKey.value()
      );

      // ── 3. Fetch changed calendar events ─────────────────────────────────
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const syncToken: string | undefined = integration.calendarSyncToken;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listParams: any = {
        calendarId: "primary",
        singleEvents: true,
      };

      if (syncToken) {
        listParams.syncToken = syncToken;
      } else {
        // Bootstrap: look back 2 hours in case this is the first notification.
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        listParams.timeMin = twoHoursAgo.toISOString();
        listParams.timeMax = new Date().toISOString();
      }

      let eventsResponse;
      try {
        eventsResponse = await calendar.events.list(listParams);
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any).code === 410) {
          // Sync token expired — retry without it.
          logger.warn("[calendarWebhook] Sync token expired, retrying without token");
          delete listParams.syncToken;
          eventsResponse = await calendar.events.list(listParams);
        } else {
          throw err;
        }
      }

      const events = eventsResponse.data.items || [];
      const nextSyncToken = eventsResponse.data.nextSyncToken;

      // Persist new sync token so future webhooks only receive deltas.
      if (nextSyncToken && nextSyncToken !== syncToken) {
        await integrationDoc.ref.update({ calendarSyncToken: nextSyncToken });
      }

      if (events.length === 0) {
        logger.info("[calendarWebhook] No changed events in this notification");
        return;
      }

      logger.info(`[calendarWebhook] Processing ${events.length} changed event(s)`);

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const workspaceFields = resolveWorkspaceFields(integration.workspaceId || "personal");

      // ── 4. Process each event ─────────────────────────────────────────────
      for (const event of events) {
        // Skip cancelled events.
        if (event.status === "cancelled") continue;

        // Only process events that have ended.
        const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;
        if (!endTime || endTime > new Date()) continue;

        // Only Google Meet meetings.
        if (!event.hangoutLink) continue;

        const eventId = event.id!;

        // ── Deduplication ──────────────────────────────────────────────────
        const processedRef = integrationDoc.ref
          .collection("processedEvents")
          .doc(eventId);
        const alreadyProcessed = await processedRef.get();
        if (alreadyProcessed.exists) {
          logger.info(`[calendarWebhook] Event ${eventId} already processed — skipping`);
          continue;
        }

        // Mark as in-progress before any async work (optimistic lock).
        await processedRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp() });

        logger.info(`[calendarWebhook] Handling event: "${event.summary}" (${eventId})`);

        // ── Classify attachments ───────────────────────────────────────────
        const attachments: CalendarAttachment[] = event.attachments || [];
        let transcriptAttachment: CalendarAttachment | null = null;
        let recordingAttachment: CalendarAttachment | null = null;

        for (const att of attachments) {
          const mime = att.mimeType || "";
          const title = (att.title || "").toLowerCase();
          if (
            mime.includes("text/vtt") ||
            mime.includes("text/plain") ||
            title.endsWith(".vtt") ||
            title.includes("transcript")
          ) {
            transcriptAttachment = att;
          } else if (mime.includes("video/mp4") || title.endsWith(".mp4")) {
            recordingAttachment = att;
          }
        }

        const duration = calcDuration(event.start, event.end);

        try {
          if (transcriptAttachment?.fileId) {
            // ── Strategy 1: Transcript-First ─────────────────────────────
            logger.info(`[calendarWebhook] Strategy 1: downloading transcript from Drive for event ${eventId}`);
            const transcriptText = await downloadDriveTextFile(drive, transcriptAttachment.fileId);

            logger.info(`[calendarWebhook] Transcript downloaded (${transcriptText.length} chars). Running GPT-4 insights...`);
            const insights = await generateMeetingInsights(transcriptText);

            const meetingId = db.collection("meetings").doc().id;
            await db.collection("meetings").doc(meetingId).set({
              title: event.summary || "Google Meet",
              duration,
              uploadedBy: userId,
              uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
              status: "processed",
              transcript: transcriptText,
              aiSummary: insights.summary,
              topicsDiscussed: insights.topicsDiscussed || [],
              workDone: insights.workDone || [],
              decisionsMade: insights.decisionsMade || [],
              aiActionItems: insights.actionItems || [],
              followUpQuestions: insights.followUpQuestions || [],
              otherObservations: insights.otherObservations || "",
              sourceLabel: "Google Meet (Transcript)",
              calendarEventId: eventId,
              hangoutLink: event.hangoutLink,
              ...workspaceFields,
            });

            logger.info(`[calendarWebhook] Meeting ${meetingId} created via Transcript-First for event ${eventId}`);

          } else if (recordingAttachment?.fileId) {
            // ── Strategy 2: Recording Fallback ────────────────────────────
            logger.info(`[calendarWebhook] Strategy 2: downloading recording from Drive for event ${eventId}`);

            // Create the Firestore meeting stub first so the storage trigger
            // can update it when it picks up the uploaded file.
            const meetingId = db.collection("meetings").doc().id;

            // Determine storage path the existing trigger expects:
            //   meetings/{workspaceId_or_userId}/{meetingId}.mp4
            const storageFolderSegment = workspaceFields.teamId || userId;
            const storagePath = `meetings/${storageFolderSegment}/${meetingId}.mp4`;

            await db.collection("meetings").doc(meetingId).set({
              title: event.summary || "Google Meet",
              duration,
              uploadedBy: userId,
              uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
              status: "uploading",
              recordingUrl: storagePath,
              sourceLabel: "Google Meet (Recording)",
              calendarEventId: eventId,
              hangoutLink: event.hangoutLink,
              ...workspaceFields,
            });

            // Download to temp file then stream to Firebase Storage.
            const tempMp4 = path.join(os.tmpdir(), `${meetingId}.mp4`);
            await downloadDriveBinaryFile(drive, recordingAttachment.fileId, tempMp4);

            const bucket = admin.storage().bucket();
            await bucket.upload(tempMp4, {
              destination: storagePath,
              metadata: { contentType: "video/mp4" },
            });

            // Clean up temp file.
            try { fs.unlinkSync(tempMp4); } catch (_) { /* best-effort */ }

            logger.info(`[calendarWebhook] MP4 uploaded to ${storagePath} for event ${eventId}. processMeetingUpload will finish processing.`);

          } else {
            // No usable attachment — Drive files may not be available yet.
            logger.info(`[calendarWebhook] No transcript or recording attachment found for event ${eventId} — will retry on next webhook.`);
            // Remove optimistic lock so the event can be retried next time.
            await processedRef.delete();
          }
        } catch (eventErr) {
          logger.error(`[calendarWebhook] Failed to process event ${eventId}`, eventErr);
          // Remove lock on failure so we can retry on the next webhook.
          await processedRef.delete();
        }
      }
    } catch (err) {
      logger.error("[calendarWebhook] Unhandled error", err);
    }
  }
);
