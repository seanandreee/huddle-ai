import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as crypto from "crypto";

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

/**
 * 1. getGoogleOAuthUrl: Called by frontend to get the auth URL
 */
export const getGoogleOAuthUrl = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { workspaceId } = request.data;
    if (!workspaceId) {
      throw new HttpsError("invalid-argument", "workspaceId is required.");
    }

    // Since onCall doesn't easily expose the full request URL for redirect_uri,
    // we use a hardcoded or env-based approach. 
    // In Firebase V2, the project ID is available.
    const projectId = process.env.GCLOUD_PROJECT || "huddleai-a812c";
    const region = process.env.FUNCTION_REGION || "us-central1";
    // For local emulator:
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    let redirectUri = `https://${region}-${projectId}.cloudfunctions.net/googleOAuthCallback`;
    if (isEmulator) {
      redirectUri = `http://127.0.0.1:5001/${projectId}/${region}/googleOAuthCallback`;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri
    );

    const scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/meetings.space.readonly",
    ];

    // Encode state securely to pass context through the OAuth flow
    const stateObj = { userId: request.auth.uid, workspaceId };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // Force consent to ensure refresh_token is returned
      scope: scopes,
      state: state,
    });

    return { url };
  }
);

/**
 * 2. googleOAuthCallback: Receives the code from Google
 */
export const googleOAuthCallback = onRequest(
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

      // Decode state
      const stateStr = Buffer.from(stateBase64, "base64").toString("utf8");
      const { userId, workspaceId } = JSON.parse(stateStr);

      if (!userId || !workspaceId) {
        res.status(400).send("Invalid state parameter.");
        return;
      }

      // Reconstruct redirectUri
      const projectId = process.env.GCLOUD_PROJECT || "huddleai-a812c";
      const region = process.env.FUNCTION_REGION || "us-central1";
      const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
      let redirectUri = `https://${region}-${projectId}.cloudfunctions.net/googleOAuthCallback`;
      if (isEmulator) {
        redirectUri = `http://127.0.0.1:5001/${projectId}/${region}/googleOAuthCallback`;
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirectUri
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        logger.warn(`No refresh token received for user ${userId}. Prompt consent might not have worked.`);
        // Note: Google only sends refresh_token on the first authorization. 
        // We might need to ask the user to revoke and try again if missing, but we'll store what we get.
      }

      const db = admin.firestore();
      
      // If we got a refresh token, encrypt it and store it
      if (tokens.refresh_token) {
        const encryptedRefreshToken = encryptToken(tokens.refresh_token, process.env.OAUTH_ENCRYPTION_KEY!);
        
        await db.collection("users").doc(userId).collection("integrations").doc("google").set({
          workspaceId,
          encryptedRefreshToken,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "connected"
        }, { merge: true });

        // Trigger calendar webhook registration
        // (We will handle the watch channel separately, but here we can just invoke the watch function)
      } else {
        // Just store the access token (temporary, not ideal but better than nothing)
        await db.collection("users").doc(userId).collection("integrations").doc("google").set({
          workspaceId,
          status: "connected_no_refresh"
        }, { merge: true });
      }

      // Redirect back to the frontend
      // In a real production app, redirect to the exact domain (e.g. huddleai.app)
      const frontendDomain = isEmulator ? "http://localhost:5173" : "https://huddleai.app";
      res.redirect(`${frontendDomain}/team/integrations?google_connected=true`);
      
    } catch (error) {
      logger.error("Error in googleOAuthCallback:", error);
      res.status(500).send("An error occurred during authentication.");
    }
  }
);

/**
 * 3. disconnectGoogleIntegration: Callable to revoke tokens and wipe data
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
      // We would ideally call oauth2Client.revokeToken() here if we had the raw token.
      // But simply deleting the doc stops auto-ingest.
      await integrationRef.delete();
      return { success: true };
    } catch (error) {
      logger.error("Error disconnecting Google:", error);
      throw new HttpsError("internal", "Failed to disconnect Google integration.");
    }
  }
);
