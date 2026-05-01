/**
 * asanaIntegration.ts
 *
 * Cloud Functions for Asana OAuth 2.0 and task creation:
 *   1. getAsanaOAuthUrl          — callable: returns Asana consent URL
 *   2. asanaOAuthCallback        — HTTP: exchanges code, stores encrypted tokens
 *   3. disconnectAsanaIntegration — callable: deletes integration doc
 *   4. getAsanaWorkspaces        — callable: fetches workspaces
 *   5. getAsanaProjects          — callable: fetches projects for a workspace
 *   6. saveAsanaMapping          — callable: persists workspace + project selection
 *   7. createAsanaTask           — callable: creates an Asana task from an action item
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { encryptToken, decryptToken } from "./googleHelpers";

// ── Secrets ──────────────────────────────────────────────────────────────────
const asanaClientId = defineSecret("ASANA_CLIENT_ID");
const asanaClientSecret = defineSecret("ASANA_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

// ── Constants ─────────────────────────────────────────────────────────────────
const ASANA_AUTH_URL = "https://app.asana.com/-/oauth_authorize";
const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ASANA_API = "https://app.asana.com/api/1.0";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAsanaCallbackUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/asanaOAuthCallback";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/asanaOAuthCallback";
}

function asanaHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function refreshAsanaToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Asana token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json() as { access_token: string; refresh_token?: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

async function getValidAsanaToken(
  integrationRef: admin.firestore.DocumentReference,
  data: admin.firestore.DocumentData,
  clientId: string,
  clientSecret: string,
  encKeyHex: string
): Promise<string> {
  const accessToken = decryptToken(data.encryptedAccessToken, encKeyHex);

  // Probe with a lightweight call
  const probe = await fetch(`${ASANA_API}/users/me`, {
    headers: asanaHeaders(accessToken),
  });
  if (probe.ok) return accessToken;

  const refreshToken = decryptToken(data.encryptedRefreshToken, encKeyHex);
  const { accessToken: newAccess, refreshToken: newRefresh } = await refreshAsanaToken(
    refreshToken, clientId, clientSecret
  );

  await integrationRef.update({
    encryptedAccessToken: encryptToken(newAccess, encKeyHex),
    encryptedRefreshToken: encryptToken(newRefresh, encKeyHex),
    tokenRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return newAccess;
}

// ── 1. getAsanaOAuthUrl ───────────────────────────────────────────────────────

export const getAsanaOAuthUrl = onCall(
  { secrets: [asanaClientId] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const state = Buffer.from(
      JSON.stringify({ userId: request.auth.uid, teamId })
    ).toString("base64");

    const params = new URLSearchParams({
      client_id: asanaClientId.value().trim(),
      redirect_uri: buildAsanaCallbackUri(),
      response_type: "code",
      state,
    });

    return { url: `${ASANA_AUTH_URL}?${params.toString()}` };
  }
);

// ── 2. asanaOAuthCallback ─────────────────────────────────────────────────────

export const asanaOAuthCallback = onRequest(
  { secrets: [asanaClientId, asanaClientSecret, encryptionKey] },
  async (req, res) => {
    try {
      const code = req.query.code as string;
      const stateBase64 = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        logger.error("[asanaOAuthCallback] Asana error:", error);
        res.status(400).send(`Asana auth failed: ${error}`);
        return;
      }
      if (!code || !stateBase64) {
        res.status(400).send("Missing code or state.");
        return;
      }

      const { userId, teamId } = JSON.parse(
        Buffer.from(stateBase64, "base64").toString("utf8")
      ) as { userId: string; teamId: string };

      if (!userId || !teamId) {
        res.status(400).send("Invalid state parameter.");
        return;
      }

      const tokenRes = await fetch(ASANA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: asanaClientId.value().trim(),
          client_secret: asanaClientSecret.value().trim(),
          redirect_uri: buildAsanaCallbackUri(),
          code,
        }).toString(),
      });

      if (!tokenRes.ok) {
        logger.error("[asanaOAuthCallback] Token exchange failed:", await tokenRes.text());
        res.status(500).send("Failed to exchange authorization code.");
        return;
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
      };

      const db = admin.firestore();
      const integrationRef = db
        .collection("teams").doc(teamId)
        .collection("integrations").doc("asana");

      await integrationRef.set({
        status: "connected",
        encryptedAccessToken: encryptToken(tokens.access_token, encryptionKey.value()),
        encryptedRefreshToken: tokens.refresh_token
          ? encryptToken(tokens.refresh_token, encryptionKey.value())
          : null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedBy: userId,
        workspaceId: null,
        workspaceName: null,
        projectId: null,
        projectName: null,
      });

      logger.info(`[asanaOAuthCallback] Connected Asana for team ${teamId}`);
      res.redirect("https://huddleai.app/integrations?asana_connected=true");
    } catch (err) {
      logger.error("[asanaOAuthCallback] Error:", err);
      res.status(500).send("Authentication error.");
    }
  }
);

// ── 3. disconnectAsanaIntegration ─────────────────────────────────────────────

export const disconnectAsanaIntegration = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("asana");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No Asana integration found.");

    await integrationRef.delete();
    logger.info(`[disconnectAsanaIntegration] Disconnected Asana for team ${teamId}`);
    return { success: true };
  }
);

// ── 4. getAsanaWorkspaces ─────────────────────────────────────────────────────

export const getAsanaWorkspaces = onCall(
  { secrets: [asanaClientId, asanaClientSecret, encryptionKey], timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("asana");

    const snap = await integrationRef.get();
    if (!snap.exists || snap.data()?.status !== "connected") {
      throw new HttpsError("failed-precondition", "Asana not connected.");
    }

    const accessToken = await getValidAsanaToken(
      integrationRef, snap.data()!,
      asanaClientId.value(), asanaClientSecret.value(), encryptionKey.value()
    );

    const res = await fetch(`${ASANA_API}/workspaces`, {
      headers: asanaHeaders(accessToken),
    });
    if (!res.ok) throw new HttpsError("internal", "Failed to fetch Asana workspaces.");

    const data = await res.json() as { data: Array<{ gid: string; name: string }> };
    const workspaces = data.data.map((w) => ({ id: w.gid, name: w.name }));

    return { workspaces };
  }
);

// ── 5. getAsanaProjects ───────────────────────────────────────────────────────

export const getAsanaProjects = onCall(
  { secrets: [asanaClientId, asanaClientSecret, encryptionKey], timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, workspaceId } = request.data as { teamId: string; workspaceId: string };
    if (!teamId || !workspaceId) {
      throw new HttpsError("invalid-argument", "teamId and workspaceId are required.");
    }

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("asana");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Asana not connected.");

    const accessToken = await getValidAsanaToken(
      integrationRef, snap.data()!,
      asanaClientId.value(), asanaClientSecret.value(), encryptionKey.value()
    );

    const res = await fetch(
      `${ASANA_API}/projects?workspace=${workspaceId}&opt_fields=gid,name&limit=100`,
      { headers: asanaHeaders(accessToken) }
    );
    if (!res.ok) throw new HttpsError("internal", "Failed to fetch Asana projects.");

    const data = await res.json() as { data: Array<{ gid: string; name: string }> };
    const projects = data.data.map((p) => ({ id: p.gid, name: p.name }));

    return { projects };
  }
);

// ── 6. saveAsanaMapping ───────────────────────────────────────────────────────

export const saveAsanaMapping = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, workspaceId, workspaceName, projectId, projectName } = request.data as {
      teamId: string;
      workspaceId: string;
      workspaceName: string;
      projectId: string;
      projectName: string;
    };

    if (!teamId || !workspaceId || !projectId) {
      throw new HttpsError("invalid-argument", "teamId, workspaceId, and projectId are required.");
    }

    const db = admin.firestore();
    await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("asana")
      .update({
        workspaceId,
        workspaceName,
        projectId,
        projectName,
        mappingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true };
  }
);

// ── 7. createAsanaTask ────────────────────────────────────────────────────────

export const createAsanaTask = onCall(
  { secrets: [asanaClientId, asanaClientSecret, encryptionKey], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, description, assigneeName, meetingTitle, meetingDate } = request.data as {
      teamId: string;
      description: string;
      assigneeName?: string;
      meetingTitle?: string;
      meetingDate?: string;
    };

    if (!teamId || !description) {
      throw new HttpsError("invalid-argument", "teamId and description are required.");
    }

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("asana");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Asana not connected.");

    const data = snap.data()!;
    if (!data.projectId) {
      throw new HttpsError(
        "failed-precondition",
        "Asana project not configured. Go to Integrations to set it up."
      );
    }

    const accessToken = await getValidAsanaToken(
      integrationRef, data,
      asanaClientId.value(), asanaClientSecret.value(), encryptionKey.value()
    );

    const noteLines: string[] = [];
    if (meetingTitle) noteLines.push(`From meeting: ${meetingTitle}${meetingDate ? ` (${meetingDate})` : ""}`);
    if (assigneeName) noteLines.push(`Assigned to: ${assigneeName}`);

    const taskBody = {
      data: {
        name: description,
        projects: [data.projectId],
        ...(noteLines.length > 0 ? { notes: noteLines.join("\n") } : {}),
      },
    };

    const createRes = await fetch(`${ASANA_API}/tasks`, {
      method: "POST",
      headers: asanaHeaders(accessToken),
      body: JSON.stringify(taskBody),
    });

    if (!createRes.ok) {
      logger.error("[createAsanaTask] Asana API error:", await createRes.text());
      throw new HttpsError("internal", "Failed to create Asana task.");
    }

    const result = await createRes.json() as { data: { gid: string; name: string } };
    const taskId = result.data.gid;
    const taskUrl = `https://app.asana.com/0/${data.projectId}/${taskId}`;

    logger.info(`[createAsanaTask] Created task ${taskId} for team ${teamId}`);
    return { taskId, taskUrl };
  }
);
