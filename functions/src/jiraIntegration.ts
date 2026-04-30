/**
 * jiraIntegration.ts
 *
 * Cloud Functions for Jira OAuth 2.0 (3-legged) flow:
 *   1. getJiraOAuthUrl          — callable: returns Atlassian consent URL
 *   2. jiraOAuthCallback        — HTTP: exchanges code, stores encrypted tokens
 *   3. disconnectJiraIntegration — callable: revokes token, deletes Firestore doc
 *   4. getJiraResources         — callable: cloud instances + projects for field mapping
 *   5. getJiraIssueTypes        — callable: issue types for a project
 *   6. saveJiraMapping          — callable: persists field mapping to Firestore
 *   7. createJiraIssue          — callable: creates a Jira issue from an action item
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { encryptToken, decryptToken } from "./googleHelpers";

// ── Secrets ──────────────────────────────────────────────────────────────────
const jiraClientId = defineSecret("JIRA_CLIENT_ID");
const jiraClientSecret = defineSecret("JIRA_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

// ── Constants ─────────────────────────────────────────────────────────────────
const JIRA_AUTH_URL = "https://auth.atlassian.com/authorize";
const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const JIRA_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildJiraCallbackUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/jiraOAuthCallback";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/jiraOAuthCallback";
}

async function refreshJiraToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(JIRA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Jira token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json() as { access_token: string; refresh_token?: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

async function getValidAccessToken(
  integrationRef: admin.firestore.DocumentReference,
  data: admin.firestore.DocumentData,
  clientId: string,
  clientSecret: string,
  encKeyHex: string
): Promise<string> {
  const accessToken = decryptToken(data.encryptedAccessToken, encKeyHex);

  const probe = await fetch(JIRA_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (probe.ok) return accessToken;

  const refreshToken = decryptToken(data.encryptedRefreshToken, encKeyHex);
  const { accessToken: newAccess, refreshToken: newRefresh } = await refreshJiraToken(
    refreshToken, clientId, clientSecret
  );

  await integrationRef.update({
    encryptedAccessToken: encryptToken(newAccess, encKeyHex),
    encryptedRefreshToken: encryptToken(newRefresh, encKeyHex),
    tokenRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return newAccess;
}

// ── 1. getJiraOAuthUrl ────────────────────────────────────────────────────────

export const getJiraOAuthUrl = onCall(
  { secrets: [jiraClientId] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const state = Buffer.from(
      JSON.stringify({ userId: request.auth.uid, teamId })
    ).toString("base64");

    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: jiraClientId.value().trim(),
      scope: "read:jira-work write:jira-work offline_access",
      redirect_uri: buildJiraCallbackUri(),
      state,
      response_type: "code",
      prompt: "consent",
    });

    return { url: `${JIRA_AUTH_URL}?${params.toString()}` };
  }
);

// ── 2. jiraOAuthCallback ──────────────────────────────────────────────────────

export const jiraOAuthCallback = onRequest(
  { secrets: [jiraClientId, jiraClientSecret, encryptionKey] },
  async (req, res) => {
    try {
      const code = req.query.code as string;
      const stateBase64 = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        logger.error("[jiraOAuthCallback] Atlassian error:", error);
        res.status(400).send(`Jira auth failed: ${error}`);
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

      const tokenRes = await fetch(JIRA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: jiraClientId.value().trim(),
          client_secret: jiraClientSecret.value().trim(),
          code,
          redirect_uri: buildJiraCallbackUri(),
        }),
      });

      if (!tokenRes.ok) {
        logger.error("[jiraOAuthCallback] Token exchange failed:", await tokenRes.text());
        res.status(500).send("Failed to exchange authorization code.");
        return;
      }

      const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string };
      const db = admin.firestore();
      const integrationRef = db
        .collection("teams").doc(teamId)
        .collection("integrations").doc("jira");

      await integrationRef.set({
        status: "connected",
        encryptedAccessToken: encryptToken(tokens.access_token, encryptionKey.value()),
        encryptedRefreshToken: tokens.refresh_token
          ? encryptToken(tokens.refresh_token, encryptionKey.value())
          : null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedBy: userId,
        cloudId: null,
        cloudName: null,
        cloudUrl: null,
        projectKey: null,
        projectName: null,
        issueTypeId: null,
        issueTypeName: null,
      });

      logger.info(`[jiraOAuthCallback] Connected team ${teamId}`);
      res.redirect("https://huddleai.app/integrations?jira_connected=true");
    } catch (err) {
      logger.error("[jiraOAuthCallback] Error:", err);
      res.status(500).send("Authentication error.");
    }
  }
);

// ── 3. disconnectJiraIntegration ──────────────────────────────────────────────

export const disconnectJiraIntegration = onCall(
  { secrets: [jiraClientId, jiraClientSecret, encryptionKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("jira");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No Jira integration found.");

    const data = snap.data()!;
    if (data.encryptedAccessToken) {
      try {
        const accessToken = decryptToken(data.encryptedAccessToken, encryptionKey.value());
        await fetch("https://auth.atlassian.com/oauth/token/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: jiraClientId.value().trim(),
            client_secret: jiraClientSecret.value().trim(),
            token: accessToken,
          }),
        });
      } catch (revokeErr) {
        logger.warn("[disconnectJiraIntegration] Token revoke failed (non-fatal):", revokeErr);
      }
    }

    await integrationRef.delete();
    logger.info(`[disconnectJiraIntegration] Disconnected team ${teamId}`);
    return { success: true };
  }
);

// ── 4. getJiraResources ───────────────────────────────────────────────────────

export const getJiraResources = onCall(
  { secrets: [jiraClientId, jiraClientSecret, encryptionKey], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("jira");

    const snap = await integrationRef.get();
    if (!snap.exists || snap.data()?.status !== "connected") {
      throw new HttpsError("failed-precondition", "Jira not connected.");
    }

    const accessToken = await getValidAccessToken(
      integrationRef, snap.data()!,
      jiraClientId.value(), jiraClientSecret.value(), encryptionKey.value()
    );

    const resourcesRes = await fetch(JIRA_RESOURCES_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!resourcesRes.ok) throw new HttpsError("internal", "Failed to fetch Jira cloud instances.");

    const resources = await resourcesRes.json() as Array<{ id: string; name: string; url: string }>;

    const clouds = await Promise.all(
      resources.map(async (cloud) => {
        const projRes = await fetch(
          `https://api.atlassian.com/ex/jira/${cloud.id}/rest/api/3/project/search?maxResults=50`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
        );
        const projData = projRes.ok
          ? (await projRes.json() as { values: Array<{ id: string; key: string; name: string }> })
          : { values: [] };
        return {
          id: cloud.id,
          name: cloud.name,
          url: cloud.url,
          projects: projData.values.map((p) => ({ id: p.id, key: p.key, name: p.name })),
        };
      })
    );

    return { clouds };
  }
);

// ── 5. getJiraIssueTypes ──────────────────────────────────────────────────────

export const getJiraIssueTypes = onCall(
  { secrets: [jiraClientId, jiraClientSecret, encryptionKey], timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, cloudId, projectKey } = request.data as {
      teamId: string; cloudId: string; projectKey: string;
    };
    if (!teamId || !cloudId || !projectKey) {
      throw new HttpsError("invalid-argument", "teamId, cloudId, and projectKey are required.");
    }

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("jira");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Jira not connected.");

    const accessToken = await getValidAccessToken(
      integrationRef, snap.data()!,
      jiraClientId.value(), jiraClientSecret.value(), encryptionKey.value()
    );

    const projRes = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${projectKey}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (!projRes.ok) throw new HttpsError("internal", "Failed to fetch project details.");

    const project = await projRes.json() as {
      issueTypes: Array<{ id: string; name: string; subtask: boolean }>;
    };
    const issueTypes = (project.issueTypes || [])
      .filter((t) => !t.subtask)
      .map((t) => ({ id: t.id, name: t.name }));

    return { issueTypes };
  }
);

// ── 6. saveJiraMapping ────────────────────────────────────────────────────────

export const saveJiraMapping = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, cloudId, cloudName, cloudUrl, projectKey, projectName, issueTypeId, issueTypeName } =
      request.data as {
        teamId: string; cloudId: string; cloudName: string; cloudUrl: string;
        projectKey: string; projectName: string; issueTypeId: string; issueTypeName: string;
      };
    if (!teamId || !cloudId || !projectKey || !issueTypeId) {
      throw new HttpsError("invalid-argument", "teamId, cloudId, projectKey, and issueTypeId are required.");
    }

    const db = admin.firestore();
    await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("jira")
      .update({ cloudId, cloudName, cloudUrl, projectKey, projectName, issueTypeId, issueTypeName,
        mappingUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });

    return { success: true };
  }
);

// ── 7. createJiraIssue ────────────────────────────────────────────────────────

export const createJiraIssue = onCall(
  { secrets: [jiraClientId, jiraClientSecret, encryptionKey], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, description, assigneeName, meetingTitle, meetingDate } = request.data as {
      teamId: string; description: string;
      assigneeName?: string; meetingTitle?: string; meetingDate?: string;
    };
    if (!teamId || !description) {
      throw new HttpsError("invalid-argument", "teamId and description are required.");
    }

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("jira");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Jira not connected.");

    const data = snap.data()!;
    if (!data.cloudId || !data.projectKey || !data.issueTypeId) {
      throw new HttpsError(
        "failed-precondition",
        "Jira field mapping not configured. Go to Integrations to set it up."
      );
    }

    const accessToken = await getValidAccessToken(
      integrationRef, data,
      jiraClientId.value(), jiraClientSecret.value(), encryptionKey.value()
    );

    const descLines: string[] = [];
    if (meetingTitle) descLines.push(`From meeting: ${meetingTitle}${meetingDate ? ` (${meetingDate})` : ""}`);
    if (assigneeName) descLines.push(`Assigned to: ${assigneeName}`);

    const issueBody: Record<string, unknown> = {
      fields: {
        project: { key: data.projectKey },
        summary: description,
        issuetype: { id: data.issueTypeId },
        ...(descLines.length > 0 ? {
          description: {
            type: "doc", version: 1,
            content: [{
              type: "paragraph",
              content: descLines.map((line) => ({ type: "text", text: line })),
            }],
          },
        } : {}),
      },
    };

    const createRes = await fetch(
      `https://api.atlassian.com/ex/jira/${data.cloudId}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(issueBody),
      }
    );

    if (!createRes.ok) {
      logger.error("[createJiraIssue] Jira API error:", await createRes.text());
      throw new HttpsError("internal", "Failed to create Jira issue.");
    }

    const issue = await createRes.json() as { id: string; key: string };
    const issueUrl = `${data.cloudUrl}/browse/${issue.key}`;

    logger.info(`[createJiraIssue] Created ${issue.key} for team ${teamId}`);
    return { issueKey: issue.key, issueUrl };
  }
);
