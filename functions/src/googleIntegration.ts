import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as crypto from "crypto";

// Bind secrets — IAM accessor role is now pre-granted on all three secrets
const clientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const clientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

// Ensure admin is initialized (usually done in index.ts)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * AES-256-GCM Encryption utilities
 */
function encryptToken(token: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
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

function buildRedirectUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/googleOAuthCallback";
  }
  // Firebase Functions v2 deploys to Cloud Run URLs (*.run.app).
  // The old cloudfunctions.net alias does NOT work as a redirect_uri for OAuth.
  // This must exactly match one of the Authorized redirect URIs in Google Cloud Console.
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/googleOAuthCallback";
}

/**
 * 1. getGoogleOAuthUrl — callable from the frontend to start the OAuth flow
 */
export const getGoogleOAuthUrl = onCall(
  { secrets: [clientId, clientSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { workspaceId } = request.data;
    if (!workspaceId) {
      throw new HttpsError("invalid-argument", "workspaceId is required.");
    }

    const redirectUri = buildRedirectUri();

    // Diagnostic logging — verify values before sending to Google
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

    const stateObj = { userId: request.auth.uid, workspaceId };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");

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

/**
 * 2. googleOAuthCallback — HTTP endpoint Google redirects to after consent
 */
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
      const { userId, workspaceId } = JSON.parse(stateStr);

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

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        logger.warn(`No refresh token received for user ${userId}.`);
      }

      const db = admin.firestore();

      if (tokens.refresh_token) {
        const encryptedRefreshToken = encryptToken(tokens.refresh_token, encryptionKey.value());

        await db.collection("users").doc(userId).collection("integrations").doc("google").set({
          workspaceId,
          encryptedRefreshToken,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "connected",
        }, { merge: true });
      } else {
        await db.collection("users").doc(userId).collection("integrations").doc("google").set({
          workspaceId,
          status: "connected_no_refresh",
        }, { merge: true });
      }

      const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
      const frontendDomain = isEmulator ? "http://localhost:5173" : "https://huddleai.app";
      res.redirect(`${frontendDomain}/team/integrations?google_connected=true`);

    } catch (err) {
      logger.error("Error in googleOAuthCallback:", err);
      res.status(500).send("An error occurred during authentication.");
    }
  }
);

/**
 * 3. disconnectGoogleIntegration — callable to revoke access and wipe stored tokens
 */
export const disconnectGoogleIntegration = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    const userId = request.auth.uid;
    const db = admin.firestore();

    const integrationRef = db.collection("users").doc(userId).collection("integrations").doc("google");
    const doc = await integrationRef.get();

    if (!doc.exists) {
      throw new HttpsError("not-found", "No Google integration found.");
    }

    try {
      await integrationRef.delete();
      return { success: true };
    } catch (err) {
      logger.error("Error disconnecting Google:", err);
      throw new HttpsError("internal", "Failed to disconnect Google integration.");
    }
  }
);
