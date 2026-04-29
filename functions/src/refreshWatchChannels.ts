/**
 * refreshWatchChannels.ts
 *
 * Scheduled Cloud Function — runs daily at 06:00 UTC.
 *
 * Finds every users/{userId}/integrations/google document whose
 * Calendar watch channel expires within the next 25 hours, stops the
 * old channel, and registers a fresh one (valid for another 7 days).
 *
 * Why 25 hours?  Google's maximum watch duration is 7 days (604,800 s).
 * Running daily with a 25-hour lookahead gives a 1-hour buffer so a
 * function outage never causes a channel to lapse.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
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

// ── Scheduled refresh ─────────────────────────────────────────────────────────

export const refreshWatchChannels = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "UTC",
    secrets: [clientId, clientSecret, encryptionKey],
    timeoutSeconds: 540,
    memory: "256MiB",
    retryCount: 3,
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // Look ahead 25 hours
    const cutoff = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 25 * 60 * 60 * 1000
    );

    logger.info("[refreshWatchChannels] Starting channel refresh run", {
      now: now.toDate().toISOString(),
      cutoff: cutoff.toDate().toISOString(),
    });

    // Fetch all integrations/google docs that have a channel expiry set
    // and that expiry falls before the cutoff.
    // Firestore collectionGroup query — requires no composite index
    // since it's a single-field filter (auto-indexed).
    const snap = await db
      .collectionGroup("integrations")
      .where("googleChannelExpiry", "<=", cutoff)
      .get();

    if (snap.empty) {
      logger.info("[refreshWatchChannels] No channels approaching expiry — nothing to do");
      return;
    }

    logger.info(`[refreshWatchChannels] Found ${snap.docs.length} channel(s) to refresh`);

    let succeeded = 0;
    let failed = 0;

    for (const integrationDoc of snap.docs) {
      const data = integrationDoc.data();
      const userId = integrationDoc.ref.parent.parent?.id;

      // Skip docs that aren't the google integration doc
      if (integrationDoc.id !== "google") continue;

      if (!userId) {
        logger.warn("[refreshWatchChannels] Could not resolve userId from path", {
          path: integrationDoc.ref.path,
        });
        continue;
      }

      if (!data.encryptedRefreshToken) {
        logger.warn(`[refreshWatchChannels] No refresh token for user ${userId} — skipping`);
        continue;
      }

      try {
        const auth = buildOAuth2Client(
          clientId.value(),
          clientSecret.value(),
          data.encryptedRefreshToken,
          encryptionKey.value()
        );

        // 1. Stop the expiring channel
        await stopWatchChannel(
          auth,
          data.googleChannelId,
          data.googleResourceId,
          userId
        );

        // 2. Register a fresh channel (updates the doc with new ids + expiry)
        await registerWatchChannel(userId, integrationDoc.ref, auth);

        logger.info(`[refreshWatchChannels] Successfully refreshed channel for user ${userId}`);
        succeeded++;
      } catch (err) {
        logger.error(
          `[refreshWatchChannels] Failed to refresh channel for user ${userId}`,
          err
        );
        failed++;
        // Continue processing other users — don't let one failure abort the batch
      }
    }

    logger.info("[refreshWatchChannels] Run complete", { succeeded, failed });
  }
);
