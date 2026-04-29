/**
 * googleIntegration.ts
 *
 * Cloud Functions for the Google Workspace OAuth flow:
 *   1. getGoogleOAuthUrl  — callable: returns the consent URL
 *   2. googleOAuthCallback — HTTP: handles the redirect, stores token,
 *                            and immediately registers a Calendar watch channel
 *   3. disconnectGoogleIntegration — callable: stops the watch channel,
 *                                    revokes the token, and deletes the doc
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import {
  encryptToken,
  buildOAuth2Client,
  registerWatchChannel,
  stopWatchChannel,
} from "./googleHelpers";

// ── Secrets ───────────────────────────────────────────────────────────────────
const clientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const clientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRedirectUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/googleOAuthCallback";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/googleOAuthCallback";
}

const ALLOWED_FRONTEND_ORIGINS = ["https://huddleai.app"];

function validateFrontendOrigin(origin: unknown): string {
  if (typeof origin === "string") {
    if (ALLOWED_FRONTEND_ORIGINS.includes(origin)) return origin;
    // Allow any localhost port for local dev
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  }
  return "https://huddleai.app";
}

// ── 1. getGoogleOAuthUrl ──────────────────────────────────────────────────────

export const getGoogleOAuthUrl = onCall(
  { secrets: [clientId, clientSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { workspaceId, origin } = request.data as { workspaceId: string; origin?: string };
    if (!workspaceId) {
      throw new HttpsError("invalid-argument", "workspaceId is required.");
    }
    const frontendOrigin = validateFrontendOrigin(origin);

    const redirectUri = buildRedirectUri();
    logger.info("[getGoogleOAuthUrl] redirectUri:", redirectUri);
    logger.info("[getGoogleOAuthUrl] clientId prefix:", clientId.value().trim().substring(0, 20));

    const oauth2Client = new google.auth.OAuth2(
      clientId.value().trim(),
      clientSecret.value().trim(),
      redirectUri
    );

    const scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ];

    const state = Buffer.from(
      JSON.stringify({ userId: request.auth.uid, workspaceId, frontendOrigin })
    ).toString("base64");

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state,
    });

    logger.info("[getGoogleOAuthUrl] generated URL:", url);
    return { url };
  }
);

// ── 2. googleOAuthCallback ────────────────────────────────────────────────────

export const googleOAuthCallback = onRequest(
  { secrets: [clientId, clientSecret, encryptionKey] },
  async (req, res) => {
    try {
      const code = req.query.code as string;
      const stateBase64 = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        logger.error("OAuth Error:", error);
        res.status(400).send(`Authentication failed: ${error}`);
        return;
      }
      if (!code || !stateBase64) {
        res.status(400).send("Missing code or state parameter.");
        return;
      }

      const stateStr = Buffer.from(stateBase64, "base64").toString("utf8");
      const { userId, workspaceId, frontendOrigin } = JSON.parse(stateStr);

      if (!userId || !workspaceId) {
        res.status(400).send("Invalid state parameter.");
        return;
      }

      const redirectUri = buildRedirectUri();
      const oauth2Client = new google.auth.OAuth2(
        clientId.value().trim(),
        clientSecret.value().trim(),
        redirectUri
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        logger.warn(`[googleOAuthCallback] No refresh token for user ${userId}.`);
      }

      const db = admin.firestore();
      const integrationRef = db
        .collection("users")
        .doc(userId)
        .collection("integrations")
        .doc("google");

      // ── Store token ───────────────────────────────────────────────────────
      if (tokens.refresh_token) {
        const encryptedRefreshToken = encryptToken(
          tokens.refresh_token,
          encryptionKey.value()
        );
        await integrationRef.set(
          {
            workspaceId,
            encryptedRefreshToken,
            connectedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "connected",
          },
          { merge: true }
        );
      } else {
        await integrationRef.set(
          { workspaceId, status: "connected_no_refresh" },
          { merge: true }
        );
      }

      // ── Register Calendar watch channel ───────────────────────────────────
      // Only attempt watch if we have a refresh token — we need it to mint
      // a new access token for the calendar.events.watch call.
      if (tokens.refresh_token) {
        try {
          oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });
          await registerWatchChannel(userId, integrationRef, oauth2Client);
        } catch (watchErr) {
          // Non-fatal: the user is connected, watch registration can be retried
          // by the daily refresh job or on next OAuth.
          logger.error(
            `[googleOAuthCallback] Failed to register watch channel for user ${userId}`,
            watchErr
          );
        }
      }

      const redirectBase = validateFrontendOrigin(frontendOrigin);
      res.redirect(`${redirectBase}/integrations?google_connected=true`);

    } catch (err) {
      logger.error("Error in googleOAuthCallback:", err);
      res.status(500).send("An error occurred during authentication.");
    }
  }
);

// ── 3. disconnectGoogleIntegration ────────────────────────────────────────────

export const disconnectGoogleIntegration = onCall(
  { secrets: [clientId, clientSecret, encryptionKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const userId = request.auth.uid;
    const db = admin.firestore();
    const integrationRef = db
      .collection("users")
      .doc(userId)
      .collection("integrations")
      .doc("google");

    const doc = await integrationRef.get();
    if (!doc.exists) {
      throw new HttpsError("not-found", "No Google integration found.");
    }

    const data = doc.data()!;

    try {
      // Stop the watch channel so Google stops sending notifications
      if (data.encryptedRefreshToken) {
        const auth = buildOAuth2Client(
          clientId.value(),
          clientSecret.value(),
          data.encryptedRefreshToken,
          encryptionKey.value()
        );
        await stopWatchChannel(
          auth,
          data.googleChannelId,
          data.googleResourceId,
          userId
        );

        // Attempt to revoke the access token at Google to fully de-authorize
        try {
          const tokenRes = await auth.getAccessToken();
          if (tokenRes.token) {
            await auth.revokeToken(tokenRes.token);
          }
        } catch (revokeErr) {
          logger.warn(`[disconnectGoogleIntegration] Token revoke failed for user ${userId}`, revokeErr);
        }
      }

      // Generate a one-time state token for CSRF so we can safely delete
      // the processedEvents subcollection too (Admin SDK bypasses rules).
      const processedEventsRef = integrationRef.collection("processedEvents");
      const processed = await processedEventsRef.limit(500).get();
      const batch = db.batch();
      processed.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(integrationRef);
      await batch.commit();

      return { success: true };
    } catch (err) {
      logger.error("Error disconnecting Google:", err);
      throw new HttpsError("internal", "Failed to disconnect Google integration.");
    }
  }
);

// ── 4. manualRegisterWatchChannel (callable, for debugging / re-registration) ─

export const manualRegisterWatchChannel = onCall(
  { secrets: [clientId, clientSecret, encryptionKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const userId = request.auth.uid;
    const db = admin.firestore();
    const integrationRef = db
      .collection("users")
      .doc(userId)
      .collection("integrations")
      .doc("google");

    const doc = await integrationRef.get();
    if (!doc.exists || !doc.data()?.encryptedRefreshToken) {
      throw new HttpsError("not-found", "No Google integration with refresh token found.");
    }

    const data = doc.data()!;

    // Stop old channel first if one exists
    const auth = buildOAuth2Client(
      clientId.value(),
      clientSecret.value(),
      data.encryptedRefreshToken,
      encryptionKey.value()
    );

    await stopWatchChannel(auth, data.googleChannelId, data.googleResourceId, userId);

    // Register new channel
    await registerWatchChannel(userId, integrationRef, auth);

    return { success: true };
  }
);

// Re-export helpers so calendarWebhook can import without going through index.ts
export { encryptToken, decryptToken } from "./googleHelpers";
