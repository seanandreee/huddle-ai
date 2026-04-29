/**
 * googleHelpers.ts
 *
 * Shared utilities for the Google integration:
 *   - AES-256-GCM token encrypt / decrypt
 *   - OAuth2 client factory
 *   - Calendar watch channel registration / stop
 *
 * Imported by googleIntegration.ts, calendarWebhook.ts, and
 * refreshWatchChannels.ts.  No Cloud Function exports here.
 */

import * as crypto from "crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";

// ── Encryption ────────────────────────────────────────────────────────────────

export function encryptToken(token: string, keyHex: string): string {
  const key = Buffer.from(keyHex.trim(), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    encrypted: encrypted.toString("hex"),
    authTag: authTag.toString("hex"),
  });
}

export function decryptToken(encryptedJson: string, keyHex: string): string {
  const { iv, encrypted, authTag } = JSON.parse(encryptedJson);
  const key = Buffer.from(keyHex.trim(), "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

// ── OAuth2 client factory ─────────────────────────────────────────────────────

export function buildOAuth2Client(
  clientIdVal: string,
  clientSecretVal: string,
  encryptedRefreshToken?: string,
  encryptionKeyHex?: string
) {
  const auth = new google.auth.OAuth2(clientIdVal.trim(), clientSecretVal.trim());
  if (encryptedRefreshToken && encryptionKeyHex) {
    const refreshToken = decryptToken(encryptedRefreshToken, encryptionKeyHex);
    auth.setCredentials({ refresh_token: refreshToken });
  }
  return auth;
}

// ── Calendar webhook URL ───────────────────────────────────────────────────────

export function calendarWebhookUrl(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/calendarWebhook";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/calendarWebhook";
}

// ── Watch channel helpers ─────────────────────────────────────────────────────

/**
 * Register a new Calendar push-notification watch channel for a user.
 * Stores googleChannelId, googleResourceId, and googleChannelExpiry
 * back into users/{userId}/integrations/google.
 */
export async function registerWatchChannel(
  userId: string,
  integrationRef: admin.firestore.DocumentReference,
  oauth2Client: ReturnType<typeof buildOAuth2Client>
): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const channelId = crypto.randomUUID();

  const watchRes = await calendar.events.watch({
    calendarId: "primary",
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: calendarWebhookUrl(),
    },
  });

  const expiry = watchRes.data.expiration
    ? admin.firestore.Timestamp.fromMillis(parseInt(watchRes.data.expiration))
    : null;

  await integrationRef.update({
    googleChannelId: channelId,
    googleResourceId: watchRes.data.resourceId || null,
    googleChannelExpiry: expiry,
  });

  logger.info(`[registerWatchChannel] Registered channel ${channelId} for user ${userId}`, {
    expiry: expiry?.toDate().toISOString(),
    resourceId: watchRes.data.resourceId,
  });
}

/**
 * Stop an existing watch channel.  Safe to call if channelId / resourceId
 * are missing — logs a warning and returns without throwing.
 */
export async function stopWatchChannel(
  oauth2Client: ReturnType<typeof buildOAuth2Client>,
  channelId: string | undefined,
  resourceId: string | undefined,
  userId: string
): Promise<void> {
  if (!channelId || !resourceId) {
    logger.warn(`[stopWatchChannel] Missing channelId or resourceId for user ${userId} — skipping stop`);
    return;
  }
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    await calendar.channels.stop({
      requestBody: { id: channelId, resourceId },
    });
    logger.info(`[stopWatchChannel] Stopped channel ${channelId} for user ${userId}`);
  } catch (err) {
    // A 404 means the channel already expired — not a real error.
    logger.warn(`[stopWatchChannel] Could not stop channel ${channelId} for user ${userId}`, err);
  }
}
