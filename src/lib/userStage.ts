/**
 * userStage — Sprint 2A
 *
 * Determines which of the 4 dashboard states a user is in.
 * Used by Team.tsx (the canonical dashboard) to decide what to render.
 *
 * Stages:
 *  SOLO_EMPTY   — no team, 0 meetings uploaded
 *  SOLO_ACTIVE  — no team, has uploaded meetings
 *  TEAM_FREE    — has a team, on free plan (default)
 *  TEAM_PAID    — has a team, on paid plan (future: check plan field)
 */

import { getMeetingsByWorkspace } from './db';
import type { Meeting } from './db';
import type { Workspace } from './WorkspaceContext';

export type UserStage = 'SOLO_EMPTY' | 'SOLO_ACTIVE' | 'TEAM_FREE' | 'TEAM_PAID';

export interface UserStageResult {
  stage: UserStage;
  soloMeetings: Meeting[]; // populated for SOLO_EMPTY and SOLO_ACTIVE
}

/**
 * Resolve the user's current stage.
 * Called once during dashboard load after auth is confirmed.
 */
export async function resolveUserStage(
  userId: string,
  workspace: Workspace
): Promise<UserStageResult> {
  // If active workspace is a team, they are in team view
  if (workspace.type === 'team') {
    // TODO Sprint 3: check team.plan === 'paid' for TEAM_PAID
    return { stage: 'TEAM_FREE', soloMeetings: [] };
  }

  // Personal workspace — check for solo meetings
  try {
    const soloMeetings = await getMeetingsByWorkspace('personal', userId, null, 5);
    if (soloMeetings.length > 0) {
      return { stage: 'SOLO_ACTIVE', soloMeetings };
    }
  } catch (e) {
    console.warn('userStage: could not load solo meetings', e);
  }

  return { stage: 'SOLO_EMPTY', soloMeetings: [] };
}
