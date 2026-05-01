/**
 * notionIntegration.ts
 *
 * Cloud Functions for Notion OAuth 2.0 flow and page creation:
 *   1. getNotionOAuthUrl         — callable: returns Notion consent URL
 *   2. notionOAuthCallback       — HTTP: exchanges code, stores encrypted token
 *   3. disconnectNotionIntegration — callable: deletes integration doc
 *   4. getNotionDatabases        — callable: fetches databases for selector
 *   5. saveNotionDatabase        — callable: persists selected database
 *
 * Also exports:
 *   syncMeetingToNotionIfEnabled — used by processMeetingFile in index.ts
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { encryptToken, decryptToken } from "./googleHelpers";

// ── Secrets ──────────────────────────────────────────────────────────────────
const notionClientId = defineSecret("NOTION_CLIENT_ID");
const notionClientSecret = defineSecret("NOTION_CLIENT_SECRET");
const encryptionKey = defineSecret("OAUTH_ENCRYPTION_KEY");

// ── Constants ─────────────────────────────────────────────────────────────────
const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNotionCallbackUri(): string {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "http://localhost:5001/huddleai-a812c/us-central1/notionOAuthCallback";
  }
  return "https://us-central1-huddleai-a812c.cloudfunctions.net/notionOAuthCallback";
}

function notionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// Split text into ≤2000-char chunks for Notion rich text blocks
function splitText(text: string): Array<{ type: "text"; text: { content: string } }> {
  const chunks: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: "text", text: { content: text.slice(i, i + 2000) } });
  }
  return chunks.length ? chunks : [{ type: "text", text: { content: "" } }];
}

async function findTitleProperty(databaseId: string, accessToken: string): Promise<string> {
  const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    headers: notionHeaders(accessToken),
  });
  if (!res.ok) return "Name";
  const db = await res.json() as { properties: Record<string, { type: string }> };
  const entry = Object.entries(db.properties).find(([, p]) => p.type === "title");
  return entry ? entry[0] : "Name";
}

// ── 1. getNotionOAuthUrl ──────────────────────────────────────────────────────

export const getNotionOAuthUrl = onCall(
  { secrets: [notionClientId] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const state = Buffer.from(
      JSON.stringify({ userId: request.auth.uid, teamId })
    ).toString("base64");

    const params = new URLSearchParams({
      client_id: notionClientId.value().trim(),
      response_type: "code",
      owner: "user",
      redirect_uri: buildNotionCallbackUri(),
      state,
    });

    return { url: `${NOTION_AUTH_URL}?${params.toString()}` };
  }
);

// ── 2. notionOAuthCallback ────────────────────────────────────────────────────

export const notionOAuthCallback = onRequest(
  { secrets: [notionClientId, notionClientSecret, encryptionKey] },
  async (req, res) => {
    try {
      const code = req.query.code as string;
      const stateBase64 = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        logger.error("[notionOAuthCallback] Notion error:", error);
        res.status(400).send(`Notion auth failed: ${error}`);
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

      // Notion uses Basic auth for token exchange
      const credentials = Buffer.from(
        `${notionClientId.value().trim()}:${notionClientSecret.value().trim()}`
      ).toString("base64");

      const tokenRes = await fetch(NOTION_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: buildNotionCallbackUri(),
        }),
      });

      if (!tokenRes.ok) {
        logger.error("[notionOAuthCallback] Token exchange failed:", await tokenRes.text());
        res.status(500).send("Failed to exchange authorization code.");
        return;
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        workspace_name?: string;
        workspace_id?: string;
      };

      const db = admin.firestore();
      const integrationRef = db
        .collection("teams").doc(teamId)
        .collection("integrations").doc("notion");

      await integrationRef.set({
        status: "connected",
        encryptedAccessToken: encryptToken(tokens.access_token, encryptionKey.value()),
        workspaceName: tokens.workspace_name || null,
        workspaceId: tokens.workspace_id || null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedBy: userId,
        databaseId: null,
        databaseName: null,
      });

      logger.info(`[notionOAuthCallback] Connected Notion for team ${teamId}`);
      res.redirect("https://huddleai.app/integrations?notion_connected=true");
    } catch (err) {
      logger.error("[notionOAuthCallback] Error:", err);
      res.status(500).send("Authentication error.");
    }
  }
);

// ── 3. disconnectNotionIntegration ────────────────────────────────────────────

export const disconnectNotionIntegration = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const integrationRef = db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("notion");

    const snap = await integrationRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No Notion integration found.");

    await integrationRef.delete();
    logger.info(`[disconnectNotionIntegration] Disconnected Notion for team ${teamId}`);
    return { success: true };
  }
);

// ── 4. getNotionDatabases ─────────────────────────────────────────────────────

export const getNotionDatabases = onCall(
  { secrets: [encryptionKey], timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId } = request.data as { teamId: string };
    if (!teamId) throw new HttpsError("invalid-argument", "teamId is required.");

    const db = admin.firestore();
    const snap = await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("notion")
      .get();

    if (!snap.exists || snap.data()?.status !== "connected") {
      throw new HttpsError("failed-precondition", "Notion not connected.");
    }

    const accessToken = decryptToken(snap.data()!.encryptedAccessToken, encryptionKey.value());

    const searchRes = await fetch(`${NOTION_API}/search`, {
      method: "POST",
      headers: notionHeaders(accessToken),
      body: JSON.stringify({ filter: { value: "database", property: "object" } }),
    });

    if (!searchRes.ok) throw new HttpsError("internal", "Failed to fetch Notion databases.");

    const data = await searchRes.json() as {
      results: Array<{
        id: string;
        title: Array<{ plain_text: string }>;
        url: string;
      }>;
    };

    const databases = data.results.map((db) => ({
      id: db.id,
      name: db.title?.[0]?.plain_text || "Untitled",
      url: db.url,
    }));

    return { databases };
  }
);

// ── 5. saveNotionDatabase ─────────────────────────────────────────────────────

export const saveNotionDatabase = onCall(
  {},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { teamId, databaseId, databaseName } = request.data as {
      teamId: string; databaseId: string; databaseName: string;
    };
    if (!teamId || !databaseId) {
      throw new HttpsError("invalid-argument", "teamId and databaseId are required.");
    }

    const db = admin.firestore();
    await db
      .collection("teams").doc(teamId)
      .collection("integrations").doc("notion")
      .update({
        databaseId,
        databaseName,
        databaseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true };
  }
);

// ── syncMeetingToNotionIfEnabled ──────────────────────────────────────────────
// Called from processMeetingFile in index.ts after the meeting is written.
// Errors are non-fatal — the caller catches and logs them.

export async function syncMeetingToNotionIfEnabled(
  meetingId: string,
  teamId: string | null,
  encKeyHex: string,
  insights: {
    summary?: string;
    actionItems?: Array<{ description: string; assignedToName?: string }>;
  } | null
): Promise<void> {
  if (!teamId) return;

  const db = admin.firestore();
  const integrationSnap = await db
    .collection("teams").doc(teamId)
    .collection("integrations").doc("notion")
    .get();

  if (!integrationSnap.exists) return;
  const integration = integrationSnap.data()!;
  if (integration.status !== "connected" || !integration.databaseId) return;

  const accessToken = decryptToken(integration.encryptedAccessToken, encKeyHex);
  const databaseId = integration.databaseId as string;

  // Fetch meeting for title + date
  const meetingSnap = await db.collection("meetings").doc(meetingId).get();
  if (!meetingSnap.exists) return;
  const meeting = meetingSnap.data()!;
  const meetingTitle = meeting.title as string || "Untitled Meeting";
  const meetingDate = meeting.date?.toDate
    ? (meeting.date.toDate() as Date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const titlePropName = await findTitleProperty(databaseId, accessToken);

  // Build page content blocks
  const children: unknown[] = [];

  if (insights?.summary) {
    children.push(
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Summary" } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: splitText(insights.summary) } }
    );
  }

  if (insights?.actionItems && insights.actionItems.length > 0) {
    children.push(
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Action Items" } }] } }
    );
    for (const item of insights.actionItems) {
      const text = item.assignedToName
        ? `${item.description} — ${item.assignedToName}`
        : item.description;
      children.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: splitText(text) },
      });
    }
  }

  // Add date callout block
  children.unshift({
    object: "block",
    type: "callout",
    callout: {
      rich_text: [{ type: "text", text: { content: `Meeting date: ${meetingDate}` } }],
      icon: { emoji: "📅" },
    },
  });

  const pageBody = {
    parent: { database_id: databaseId },
    properties: {
      [titlePropName]: {
        title: [{ type: "text", text: { content: meetingTitle } }],
      },
    },
    children,
  };

  const createRes = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(accessToken),
    body: JSON.stringify(pageBody),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Notion page creation failed (${createRes.status}): ${errBody}`);
  }

  const page = await createRes.json() as { id: string; url: string };

  await db.collection("meetings").doc(meetingId).update({
    notionPageId: page.id,
    notionPageUrl: page.url,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`[syncMeetingToNotionIfEnabled] Created Notion page ${page.id} for meeting ${meetingId}`);
}
