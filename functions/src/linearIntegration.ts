/**
 * linearIntegration.ts
 *
 * Cloud Functions for Linear OAuth 2.0 and issue creation:
 *   1. getLinearOAuthUrl        — callable: returns Linear consent URL
 *   2. linearOAuthCallback      — HTTP: exchanges code, stores encrypted token
 *   3. disconnectLinearIntegration — callable: deletes integration doc
 *   4. getLinearTeams           — callable: fetches teams + projects for field mapping
 *   5. saveLinearMapping        — callable: persists team + project selection
 *   6. createLinearIssue        — callable: creates a Linear issue from an action item
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { encryptToken, decryptToken } from "./googleHelpers";

// ── Secrets ──────────────────────────────────────────────────────────────────
const linearClientId = defineSecret("LINEAR_CLIENT_ID");
const linearClientSecret = defineSecret("LINEAR_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

// ── Constants ─────────────────────────────────────────────────────────────────
const LINEAR_AUTH_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
const LINEAR_GQL_URL = "https://api.linear.app/graphql";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLinearCallbackUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/linearOAuthCallback";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/linearOAuthCallback";
}

async function linearGql<T>(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  const res = await fetch(LINEAR_GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API error (${res.status}): ${await res.text()}`);
  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Linear GraphQL: ${json.errors[0].message}`);
  return json.data as T;
}

// ── 1. getLinearOAuthUrl ──────────────────────────────────────────────────────

export const getLinearOAuthUrl = onCall(
  { secrets: [linearClientId] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const state = Buffer.from(
      JSON.stringify({ userId: request.auth.uid, teamId })
    ).toString("base64");

    const params = new URLSearchParams({
      client_id: linearClientId.value().trim(),
      redirect_uri: buildLinearCallbackUri(),
      response_type: "code",
      scope: "read,write",
      state,
      prompt: "consent",
    });

    return { url: `${LINEAR_AUTH_URL}?${params.toString()}` };
  }
);

// ── 2. linearOAuthCallback ────────────────────────────────────────────────────

export const linearOAuthCallback = onRequest(
  { secrets: [linearClientId, linearClientSecret, encryptionKey] },
  async (req, res) => {
    try {
      const code = req.query.code as string;
      const stateBase64 = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        logger.error("[linearOAuthCallback] Linear error:", error);
        res.status(400).send(`Linear auth failed: ${error}`);
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

      // Linear token exchange uses form-encoded body
      const tokenRes = await fetch(LINEAR_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: linearClientId.value().trim(),
          client_secret: linearClientSecret.value().trim(),
          redirect_uri: buildLinearCallbackUri(),
          code,
        }).toString(),
      });

      if (!tokenRes.ok) {
        logger.error("[linearOAuthCallback] Token exchange failed:", await tokenRes.text());
        res.status(500).send("Failed to exchange authorization code.");
        return;
      }

      const tokens = await tokenRes.json() as { access_token: string };
      const db = admin.firestore();
      const integrationRef = db
        .collection("teams").doc(teamId)
        .collection("integrations").doc("linear");

      await integrationRef.set({
        status: "connected",
        encryptedAccessToken: encryptToken(tokens.access_token, encryptionKey.value()),
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedBy: userId,
        linearTeamId: null,
        linearTeamName: null,
        linearProjectId: null,
        linearProjectName: null,
      });

      logger.info(`[linearOAuthCallback] Connected Linear for team ${teamId}`);
      res.redirect("https://huddleai.app/integrations?linear_connected=true");
    } catch (err) {
      logger.error("[linearOAuthCallback] Error:", err);
      res.status(500).send("Authentication error.");
    }
  }
);

// ── 3. disconnectLinearIntegration ────────────────────────────────────────────

export const disconnectLinearIntegration = onCall(
  { secrets: [linearClientId, linearClientSecret, encryptionKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("linear");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No Linear integration found.");

    const data = snap.data()!;
    // Best-effort token revoke
    if (data.encryptedAccessToken) {
      try {
        const accessToken = decryptToken(data.encryptedAccessToken, encryptionKey.value());
        await fetch("https://api.linear.app/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: linearClientId.value().trim(),
            client_secret: linearClientSecret.value().trim(),
            access_token: accessToken,
          }).toString(),
        });
      } catch (revokeErr) {
        logger.warn("[disconnectLinearIntegration] Token revoke failed (non-fatal):", revokeErr);
      }
    }

    await integrationRef.delete();
    logger.info(`[disconnectLinearIntegration] Disconnected Linear for team ${teamId}`);
    return { success: true };
  }
);

// ── 4. getLinearTeams ─────────────────────────────────────────────────────────

export const getLinearTeams = onCall(
  { secrets: [encryptionKey], timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const snap = await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("linear")
      .get();

    if (!snap.exists || snap.data()?.status !== "connected") {
      throw new HttpsError("failed-precondition", "Linear not connected.");
    }

    const accessToken = decryptToken(snap.data()!.encryptedAccessToken, encryptionKey.value());

    const data = await linearGql<{
      teams: {
        nodes: Array<{
          id: string;
          name: string;
          projects: { nodes: Array<{ id: string; name: string }> };
        }>;
      };
    }>(
      `query {
        teams {
          nodes {
            id
            name
            projects {
              nodes { id name }
            }
          }
        }
      }`,
      {},
      accessToken
    );

    const teams = data.teams.nodes.map((t) => ({
      id: t.id,
      name: t.name,
      projects: t.projects.nodes.map((p) => ({ id: p.id, name: p.name })),
    }));

    return { teams };
  }
);

// ── 5. saveLinearMapping ──────────────────────────────────────────────────────

export const saveLinearMapping = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, linearTeamId, linearTeamName, linearProjectId, linearProjectName } =
      request.data as {
        teamId: string;
        linearTeamId: string;
        linearTeamName: string;
        linearProjectId?: string;
        linearProjectName?: string;
      };

    if (!teamId || !linearTeamId) {
      throw new HttpsError("invalid-argument", "teamId and linearTeamId are required.");
    }

    const db = admin.firestore();
    await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("linear")
      .update({
        linearTeamId,
        linearTeamName,
        linearProjectId: linearProjectId || null,
        linearProjectName: linearProjectName || null,
        mappingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true };
  }
);

// ── 6. createLinearIssue ──────────────────────────────────────────────────────

export const createLinearIssue = onCall(
  { secrets: [encryptionKey], timeoutSeconds: 30 },
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
      .collection("integrations").doc("linear");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Linear not connected.");

    const data = snap.data()!;
    if (!data.linearTeamId) {
      throw new HttpsError(
        "failed-precondition",
        "Linear team not configured. Go to Integrations to set it up."
      );
    }

    const accessToken = decryptToken(data.encryptedAccessToken, encryptionKey.value());

    const descLines: string[] = [];
    if (meetingTitle) descLines.push(`From meeting: ${meetingTitle}${meetingDate ? ` (${meetingDate})` : ""}`);
    if (assigneeName) descLines.push(`Assigned to: ${assigneeName}`);

    const input: Record<string, unknown> = {
      teamId: data.linearTeamId,
      title: description,
      ...(descLines.length > 0 ? { description: descLines.join("\n") } : {}),
      ...(data.linearProjectId ? { projectId: data.linearProjectId } : {}),
    };

    const result = await linearGql<{
      issueCreate: { success: boolean; issue: { id: string; url: string; identifier: string } };
    }>(
      `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id url identifier }
        }
      }`,
      { input },
      accessToken
    );

    if (!result.issueCreate.success) {
      throw new HttpsError("internal", "Linear issue creation failed.");
    }

    const issue = result.issueCreate.issue;
    logger.info(`[createLinearIssue] Created ${issue.identifier} for team ${teamId}`);
    return { issueKey: issue.identifier, issueUrl: issue.url };
  }
);
