import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp, 
  Timestamp,
  orderBy,
  limit,
  deleteField,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

export interface SlackIntegration {
  id: string;
  teamId: string;
  channelId: string;
  channelName: string;
  webhookUrl: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  members: string[]; // Array of user IDs
  pendingInvites: string[]; // Array of user IDs
  slackIntegration?: SlackIntegration; // Optional Slack integration
}

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  invitedBy: string;
  invitedByName: string; 
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
}

export interface UserTeams {
  teams: string[]; // Array of team IDs the user belongs to
  currentTeam: string | null; // Currently selected team
  pendingInvites: string[]; // Array of invite IDs
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  role?: 'admin' | 'moderator' | 'member';
  status?: 'online' | 'away' | 'offline' | 'inactive';
  lastActive?: Timestamp;
  joinedDate?: Timestamp;
  teamJoinDates?: Record<string, Timestamp>; // Record of team IDs to join dates
}

export interface TeamMember extends UserProfile {
  joinedDate: Timestamp;
  role: 'admin' | 'moderator' | 'member';
  status: 'online' | 'away' | 'offline' | 'inactive';
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  text: string;
  timestamp: Timestamp;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  teamId: string;
  uploadedBy: string;
  uploadedByName: string;
  date: Timestamp;
  duration: number; // in seconds
  participants: string[]; // array of user IDs or names
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  summary?: string;
  transcript?: string;
  transcriptUrl?: string;
  recordingUrl?: string;
  actionItems?: ActionItem[];
  comments?: Comment[];
  // AI-generated insights
  aiSummary?: string;
  topicsDiscussed?: string[];
  workDone?: string[];
  aiActionItems?: ActionItem[];
  decisionsMade?: string[];
  followUpQuestions?: string[];
  otherObservations?: string;
  // Slack notification tracking
  slackNotificationSent?: boolean;
  slackNotificationSentAt?: Timestamp;
  slackNotificationSentBy?: string;
  processedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ActionItem {
  id: string;
  meetingId?: string;
  description: string;
  assignedTo?: string; // user ID
  assignedToName?: string;
  dueDate?: string; // ISO date string or Timestamp
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Create a new team
export const createTeam = async (teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const teamsRef = collection(db, 'teams');
    const newTeamRef = doc(teamsRef);
    
    const timestamp = serverTimestamp();
    
    const teamWithMetadata = {
      ...teamData,
      id: newTeamRef.id,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    await setDoc(newTeamRef, teamWithMetadata);
    
    // Add team to user's teams
    await updateUserTeams(teamData.ownerId, newTeamRef.id);
    
    // Set the owner as an admin
    await updateUserRole(teamData.ownerId, newTeamRef.id, 'admin');
    
    return newTeamRef.id;
  } catch (error) {
    console.error("Error creating team:", error);
    throw error;
  }
};

// Update user's teams (add new team and set as current)
export const updateUserTeams = async (userId: string, teamId: string) => {
  try {
    const userTeamsRef = doc(db, 'userTeams', userId);
    const userTeamsDoc = await getDoc(userTeamsRef);
    
    if (userTeamsDoc.exists()) {
      // Update existing document
      await updateDoc(userTeamsRef, {
        teams: arrayUnion(teamId),
        currentTeam: teamId,
        updatedAt: serverTimestamp()
      });
    } else {
      // Create new document
      await setDoc(userTeamsRef, {
        teams: [teamId],
        currentTeam: teamId,
        pendingInvites: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return true;
  } catch (error) {
    console.error("Error updating user teams:", error);
    throw error;
  }
};

// Get a team by ID
export const getTeamById = async (teamId: string) => {
  try {
    const teamRef = doc(db, 'teams', teamId);
    const teamDoc = await getDoc(teamRef);
    
    if (teamDoc.exists()) {
      return { id: teamDoc.id, ...teamDoc.data() } as Team;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting team:", error);
    throw error;
  }
};

// Get user's teams
export const getUserTeams = async (userId: string) => {
  try {
    const userTeamsRef = doc(db, 'userTeams', userId);
    const userTeamsDoc = await getDoc(userTeamsRef);
    
    if (userTeamsDoc.exists()) {
      return userTeamsDoc.data() as UserTeams;
    } else {
      return {
        teams: [],
        currentTeam: null,
        pendingInvites: []
      } as UserTeams;
    }
  } catch (error) {
    console.error("Error getting user teams:", error);
    throw error;
  }
};

// Get user details by ID
export const getUserById = async (userId: string): Promise<UserProfile | null> => {
  try {
    // First try to get user from Firestore users collection
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
    }
    
    // If not found in Firestore, get from Firebase Auth
    const currentUser = auth.currentUser;
    
    // If the requested user is the current authenticated user
    if (currentUser && currentUser.uid === userId) {
      // Create a UserProfile from Auth user
      const userProfile: UserProfile = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Anonymous User',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL,
        status: 'online'
      };
      
      // Optionally save this user data to Firestore for future queries
      await setDoc(userRef, {
        displayName: userProfile.displayName,
        email: userProfile.email,
        photoURL: userProfile.photoURL,
        status: userProfile.status,
        lastActive: serverTimestamp()
      });
      
      return userProfile;
    }
    
    // For other users, we might need to query by UID or handle differently
    // For now, return null if user not found
    return null;
  } catch (error) {
    console.error("Error getting user:", error);
    throw error;
  }
};

// Get all users from a list of user IDs
export const getUsersByIds = async (userIds: string[]): Promise<UserProfile[]> => {
  try {
    const users: UserProfile[] = [];
    
    // Process in batches to avoid excessive parallel requests
    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (user) {
        users.push(user);
      }
    }
    
    return users;
  } catch (error) {
    console.error("Error getting users:", error);
    throw error;
  }
};

// Ensure user profile exists
export const ensureUserProfileExists = async (userId: string, displayName: string, email: string, photoURL?: string): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        displayName,
        email,
        photoURL: photoURL || null,
        status: 'online',
        lastActive: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Error ensuring user profile exists:", error);
    throw error;
  }
};

// Get team members for a team
export const getTeamMembers = async (teamId: string): Promise<TeamMember[]> => {
  try {
    // First get the team to get member IDs
    const team = await getTeamById(teamId);
    if (!team || !team.members || team.members.length === 0) {
      return [];
    }

    // Get all member profiles
    const memberProfiles = await getUsersByIds(team.members);
    
    // Convert to TeamMember format
    const teamMembers: TeamMember[] = memberProfiles.map(profile => ({
      ...profile,
      role: profile.role || 'member', // Default role if not specified
      status: profile.status || 'offline', // Default status if not specified
      joinedDate: profile.lastActive || team.createdAt // Use lastActive or team creation date as fallback
    }));

    return teamMembers;
  } catch (error) {
    console.error("Error getting team members:", error);
    throw error;
  }
};

// Get pending team invites
export const getPendingTeamInvites = async (teamId: string): Promise<TeamInvite[]> => {
  try {
    const invitesRef = collection(db, 'teamInvites');
    const q = query(
      invitesRef,
      where('teamId', '==', teamId),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(q);
    const invites: TeamInvite[] = [];
    
    querySnapshot.forEach((doc) => {
      invites.push({ id: doc.id, ...doc.data() } as TeamInvite);
    });
    
    return invites;
  } catch (error) {
    console.error("Error getting pending team invites:", error);
    throw error;
  }
};

// Update user role in team
export const updateUserRole = async (userId: string, teamId: string, role: 'admin' | 'moderator' | 'member'): Promise<void> => {
  try {
    // Update user's role in their profile
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // Create or update the teamRoles map
      const userData = userDoc.data();
      const teamRoles = userData.teamRoles || {};
      teamRoles[teamId] = role;
      
      await updateDoc(userRef, {
        teamRoles,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
};

// Get user's role in a specific team
export const getUserRoleInTeam = async (userId: string, teamId: string): Promise<'admin' | 'moderator' | 'member' | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const teamRoles = userData.teamRoles || {};
      return teamRoles[teamId] || null;
    }
    
    return null;
  } catch (error) {
    console.error("Error getting user role in team:", error);
    throw error;
  }
};

// Remove a member from team
export const removeTeamMember = async (userId: string, teamId: string): Promise<void> => {
  try {
    // First verify this isn't the owner
    const team = await getTeamById(teamId);
    if (!team) {
      throw new Error("Team not found");
    }
    
    if (team.ownerId === userId) {
      throw new Error("Cannot remove the team owner");
    }
    
    // Remove user from team
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      members: arrayRemove(userId),
      updatedAt: serverTimestamp()
    });
    
    // Remove team from user's teams
    const userTeamsRef = doc(db, 'userTeams', userId);
    const userTeamsDoc = await getDoc(userTeamsRef);
    
    if (userTeamsDoc.exists()) {
      const userTeams = userTeamsDoc.data() as UserTeams;
      
      // Remove this team from the array
      const updatedTeams = userTeams.teams.filter(id => id !== teamId);
      
      // Update the currentTeam if needed
      const currentTeam = userTeams.currentTeam === teamId
        ? (updatedTeams.length > 0 ? updatedTeams[0] : null)
        : userTeams.currentTeam;
      
      await updateDoc(userTeamsRef, {
        teams: updatedTeams,
        currentTeam,
        updatedAt: serverTimestamp()
      });
    }
    
    // Remove role for this team
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const teamRoles = userData.teamRoles || {};
      
      // Remove this team's entry and update
      if (teamRoles[teamId]) {
        delete teamRoles[teamId];
        await updateDoc(userRef, {
          teamRoles,
          updatedAt: serverTimestamp()
        });
      }
      
      // If the user has teamJoinDates, remove this team's entry
      if (userData.teamJoinDates && userData.teamJoinDates[teamId]) {
        await updateDoc(userRef, {
          [`teamJoinDates.${teamId}`]: deleteField(),
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error("Error removing team member:", error);
    throw error;
  }
};

// Record user join date for a team
export const recordTeamJoinDate = async (userId: string, teamId: string, joinDate: Timestamp = serverTimestamp() as Timestamp): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      await updateDoc(userRef, {
        [`teamJoinDates.${teamId}`]: joinDate,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Error recording team join date:", error);
    throw error;
  }
};

// Transfer team ownership
export const transferTeamOwnership = async (teamId: string, newOwnerId: string): Promise<void> => {
  try {
    const team = await getTeamById(teamId);
    if (!team) {
      throw new Error("Team not found");
    }
    
    const oldOwnerId = team.ownerId;
    
    // Ensure new owner is a member
    if (!team.members.includes(newOwnerId)) {
      throw new Error("New owner must be a team member");
    }
    
    // Update team ownership
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      ownerId: newOwnerId,
      updatedAt: serverTimestamp()
    });
    
    // Update roles - make previous owner a moderator, new owner an admin
    await updateUserRole(oldOwnerId, teamId, 'moderator');
    await updateUserRole(newOwnerId, teamId, 'admin');
  } catch (error) {
    console.error("Error transferring team ownership:", error);
    throw error;
  }
};

// Get all meetings for a team with optional filtering and ordering
export const getAllMeetingsForTeam = async (
  teamId: string, 
  orderByField: 'date' | 'createdAt' = 'date',
  orderDirection: 'desc' | 'asc' = 'desc',
  statusFilter?: 'uploaded' | 'processing' | 'processed' | 'failed',
  userId?: string // Optional parameter for additional security
) => {
  try {
    // Security validation: Ensure teamId is not empty
    if (!teamId || teamId.trim() === '') {
      console.warn("getAllMeetingsForTeam: teamId is empty, returning empty array to prevent data leak");
      return [];
    }
    
    // Additional security: Verify user has access to team if userId is provided
    if (userId) {
      try {
        const userTeams = await getUserTeams(userId);
        if (!userTeams.teams.includes(teamId)) {
          console.warn(`getAllMeetingsForTeam: User ${userId} does not belong to team ${teamId}, returning empty array`);
          return [];
        }
      } catch (error) {
        console.warn("getAllMeetingsForTeam: Error checking user team membership, proceeding with caution");
      }
    }
    
    const meetingsRef = collection(db, 'meetings');
    let q = query(
      meetingsRef,
      where('teamId', '==', teamId)
    );

    // Add status filter if provided
    if (statusFilter) {
      q = query(q, where('status', '==', statusFilter));
    }

    // Add ordering
    q = query(q, orderBy(orderByField, orderDirection));
    
    const querySnapshot = await getDocs(q);
    const meetings: Meeting[] = [];
    
    querySnapshot.forEach((doc) => {
      const meeting = { id: doc.id, ...doc.data() } as Meeting;
      meetings.push(meeting);
    });
    
    return meetings;
  } catch (error) {
    console.error("Error getting all team meetings:", error);
    throw error;
  }
};

// Get recent meetings for a team
export const getRecentMeetingsForTeam = async (teamId: string, count: number = 5) => {
  try {
    // Security validation: Ensure teamId is not empty
    if (!teamId || teamId.trim() === '') {
      console.warn("getRecentMeetingsForTeam: teamId is empty, returning empty array to prevent data leak");
      return [];
    }
    
    const meetingsRef = collection(db, 'meetings');
    const q = query(
      meetingsRef,
      where('teamId', '==', teamId),
      orderBy('date', 'desc'),
      limit(count)
    );
    
    const querySnapshot = await getDocs(q);
    const meetings: Meeting[] = [];
    
    querySnapshot.forEach((doc) => {
      meetings.push({ id: doc.id, ...doc.data() } as Meeting);
    });
    
    return meetings;
  } catch (error) {
    console.error("Error getting team meetings:", error);
    throw error;
  }
};

// Get total meeting stats for a team
export const getTeamMeetingStats = async (teamId: string) => {
  try {
    // Security validation: Ensure teamId is not empty
    if (!teamId || teamId.trim() === '') {
      console.warn("getTeamMeetingStats: teamId is empty, returning empty stats to prevent data leak");
      return {
        totalMeetings: 0,
        totalDuration: 0,
        processedMeetings: 0,
        totalActionItems: 0,
        completedActionItems: 0,
        averageDuration: 0
      };
    }
    
    const meetingsRef = collection(db, 'meetings');
    const q = query(meetingsRef, where('teamId', '==', teamId));
    
    const querySnapshot = await getDocs(q);
    
    let totalMeetings = 0;
    let totalDuration = 0; // in seconds
    let processedMeetings = 0;
    let totalActionItems = 0;
    let completedActionItems = 0;
    
    querySnapshot.forEach((doc) => {
      const meeting = doc.data() as Meeting;
      totalMeetings++;
      totalDuration += meeting.duration || 0;
      
      if (meeting.status === 'processed') {
        processedMeetings++;
      }
      
      if (meeting.actionItems) {
        totalActionItems += meeting.actionItems.length;
        completedActionItems += meeting.actionItems.filter(item => item.status === 'completed').length;
      }
    });
    
    return {
      totalMeetings,
      totalDuration,
      processedMeetings,
      totalActionItems,
      completedActionItems,
      averageDuration: totalMeetings > 0 ? totalDuration / totalMeetings : 0
    };
  } catch (error) {
    console.error("Error getting team meeting stats:", error);
    throw error;
  }
};

// Create a team invite
export const createTeamInvite = async (
  teamId: string, 
  teamName: string, 
  invitedByUserId: string, 
  invitedByName: string, 
  invitedEmail: string
) => {
  try {
    const invitesRef = collection(db, 'teamInvites');
    const newInviteRef = doc(invitesRef);
    
    const timestamp = serverTimestamp();
    
    const invite: Omit<TeamInvite, 'id'> = {
      teamId,
      teamName,
      invitedBy: invitedByUserId,
      invitedByName,
      invitedEmail,
      status: 'pending',
      createdAt: timestamp as Timestamp
    };
    
    await setDoc(newInviteRef, invite);
    
    // Add reference to the team's pendingInvites
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      pendingInvites: arrayUnion(invitedEmail),
      updatedAt: serverTimestamp()
    });
    
    return newInviteRef.id;
  } catch (error) {
    console.error("Error creating team invite:", error);
    throw error;
  }
};

// Get invites for a user by email
export const getInvitesByEmail = async (email: string) => {
  try {
    const invitesRef = collection(db, 'teamInvites');
    const q = query(
      invitesRef, 
      where('invitedEmail', '==', email),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(q);
    const invites: TeamInvite[] = [];
    
    querySnapshot.forEach((doc) => {
      invites.push({ id: doc.id, ...doc.data() } as TeamInvite);
    });
    
    return invites;
  } catch (error) {
    console.error("Error getting team invites:", error);
    throw error;
  }
};

// Accept a team invite
export const acceptTeamInvite = async (inviteId: string, userId: string) => {
  try {
    // Get the invite
    const inviteRef = doc(db, 'teamInvites', inviteId);
    const inviteDoc = await getDoc(inviteRef);
    
    if (!inviteDoc.exists()) {
      throw new Error("Invite not found");
    }
    
    const invite = inviteDoc.data() as TeamInvite;
    
    // Update the invite status
    await updateDoc(inviteRef, {
      status: 'accepted'
    });
    
    // Add user to team and remove from pendingInvites
    const teamRef = doc(db, 'teams', invite.teamId);
    await updateDoc(teamRef, {
      members: arrayUnion(userId),
      pendingInvites: arrayRemove(invite.invitedEmail),
      updatedAt: serverTimestamp()
    });
    
    // Ensure the user has a profile in the database
    if (auth.currentUser) {
      await ensureUserProfileExists(
        userId,
        auth.currentUser.displayName || 'Team Member',
        invite.invitedEmail,
        auth.currentUser.photoURL || null
      );
    }
    
    // Record join date
    await recordTeamJoinDate(userId, invite.teamId);
    
    // Set user role to 'member'
    await updateUserRole(userId, invite.teamId, 'member');
    
    // Add team to user's teams
    await updateUserTeams(userId, invite.teamId);
    
    return invite.teamId;
  } catch (error) {
    console.error("Error accepting team invite:", error);
    throw error;
  }
};

// Decline a team invite
export const declineTeamInvite = async (inviteId: string) => {
  try {
    const inviteRef = doc(db, 'teamInvites', inviteId);
    const inviteDoc = await getDoc(inviteRef);
    
    if (!inviteDoc.exists()) {
      throw new Error("Invite not found");
    }
    
    const invite = inviteDoc.data() as TeamInvite;
    
    // Update invite status
    await updateDoc(inviteRef, {
      status: 'declined'
    });
    
    // Remove email from pendingInvites in the team
    const teamRef = doc(db, 'teams', invite.teamId);
    await updateDoc(teamRef, {
      pendingInvites: arrayRemove(invite.invitedEmail),
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error("Error declining team invite:", error);
    throw error;
  }
};

// Check if user belongs to a team
export const checkUserHasTeam = async (userId: string) => {
  try {
    const userTeams = await getUserTeams(userId);
    return userTeams.teams.length > 0;
  } catch (error) {
    console.error("Error checking if user has team:", error);
    throw error;
  }
};

// Update team details
export const updateTeam = async (teamId: string, updates: { name?: string; description?: string }): Promise<void> => {
  try {
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating team:", error);
    throw error;
  }
};

// Slack Integration Functions

// Create or update Slack integration for a team
export const createSlackIntegration = async (
  teamId: string, 
  channelId: string, 
  channelName: string, 
  webhookUrl: string, 
  createdBy: string
): Promise<string> => {
  try {
    const integrationRef = collection(db, 'slackIntegrations');
    const newIntegrationRef = doc(integrationRef);
    
    const timestamp = serverTimestamp();
    
    const integration: Omit<SlackIntegration, 'id'> = {
      teamId,
      channelId,
      channelName,
      webhookUrl,
      isActive: true,
      createdBy,
      createdAt: timestamp as Timestamp,
      updatedAt: timestamp as Timestamp
    };
    
    await setDoc(newIntegrationRef, integration);
    
    // Update the team document with the integration reference
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      slackIntegration: {
        id: newIntegrationRef.id,
        ...integration
      },
      updatedAt: serverTimestamp()
    });
    
    return newIntegrationRef.id;
  } catch (error) {
    console.error("Error creating Slack integration:", error);
    throw error;
  }
};

// Get Slack integration for a team
export const getSlackIntegration = async (teamId: string): Promise<SlackIntegration | null> => {
  try {
    const integrationsRef = collection(db, 'slackIntegrations');
    const q = query(
      integrationsRef,
      where('teamId', '==', teamId),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as SlackIntegration;
  } catch (error) {
    console.error("Error getting Slack integration:", error);
    throw error;
  }
};

// Update Slack integration
export const updateSlackIntegration = async (
  integrationId: string, 
  updates: Partial<Omit<SlackIntegration, 'id' | 'teamId' | 'createdBy' | 'createdAt'>>
): Promise<void> => {
  try {
    const integrationRef = doc(db, 'slackIntegrations', integrationId);
    await updateDoc(integrationRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
    // Also update the team document if needed
    if (updates.channelId || updates.channelName || updates.webhookUrl || updates.isActive !== undefined) {
      const integrationDoc = await getDoc(integrationRef);
      if (integrationDoc.exists()) {
        const integrationData = integrationDoc.data() as SlackIntegration;
        const teamRef = doc(db, 'teams', integrationData.teamId);
        await updateDoc(teamRef, {
          slackIntegration: {
            id: integrationId,
            ...integrationData,
            ...updates
          },
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error("Error updating Slack integration:", error);
    throw error;
  }
};

// Disable Slack integration
export const disableSlackIntegration = async (teamId: string): Promise<void> => {
  try {
    const integration = await getSlackIntegration(teamId);
    if (integration) {
      await updateSlackIntegration(integration.id, { isActive: false });
    }
    
    // Remove from team document
    const teamRef = doc(db, 'teams', teamId);
    await updateDoc(teamRef, {
      slackIntegration: deleteField(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error disabling Slack integration:", error);
    throw error;
  }
};

// Action Item Management Functions

// Get all action items for a team from all meetings
export const getTeamActionItems = async (teamId: string, userId?: string) => {
  try {
    // Security validation: Ensure teamId is not empty
    if (!teamId || teamId.trim() === '') {
      console.warn("getTeamActionItems: teamId is empty, returning empty array to prevent data leak");
      return [];
    }
    
    // Additional security: Verify user has access to team if userId is provided
    if (userId) {
      try {
        const userTeams = await getUserTeams(userId);
        if (!userTeams.teams.includes(teamId)) {
          console.warn(`getTeamActionItems: User ${userId} does not belong to team ${teamId}, returning empty array`);
          return [];
        }
      } catch (error) {
        console.warn("getTeamActionItems: Error checking user team membership, proceeding with caution");
      }
    }
    
    const meetingsRef = collection(db, 'meetings');
    const q = query(
      meetingsRef,
      where('teamId', '==', teamId),
      orderBy('date', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const allActionItems: (ActionItem & { teamId: string; meetingTitle?: string })[] = [];
    
    querySnapshot.forEach((doc) => {
      const meeting = doc.data() as Meeting;
      
      // Process regular action items
      if (meeting.actionItems && meeting.actionItems.length > 0) {
        meeting.actionItems.forEach(item => {
          allActionItems.push({
            ...item,
            teamId,
            meetingId: meeting.id,
            meetingTitle: meeting.title
          });
        });
      }
      
      // Process AI-generated action items
      if (meeting.aiActionItems && meeting.aiActionItems.length > 0) {
        meeting.aiActionItems.forEach(item => {
          allActionItems.push({
            ...item,
            teamId,
            meetingId: meeting.id,
            meetingTitle: meeting.title
          });
        });
      }
    });
    
    // Sort by creation date (newest first)
    allActionItems.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });
    
    return allActionItems;
  } catch (error) {
    console.error("Error getting team action items:", error);
    throw error;
  }
};

// Get action items for a specific meeting
export const getMeetingActionItems = async (meetingId: string) => {
  try {
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      return [];
    }
    
    const meeting = meetingDoc.data() as Meeting;
    const actionItems: ActionItem[] = [];
    
    // Add regular action items
    if (meeting.actionItems) {
      actionItems.push(...meeting.actionItems);
    }
    
    // Add AI-generated action items
    if (meeting.aiActionItems) {
      actionItems.push(...meeting.aiActionItems);
    }
    
    return actionItems;
  } catch (error) {
    console.error("Error getting meeting action items:", error);
    throw error;
  }
};

// Create a new action item and add it to the specified meeting
export const createActionItem = async (actionItemData: {
  description: string;
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  status?: 'pending' | 'in-progress' | 'completed';
  meetingId: string; // Required for manual creation
  teamId: string;
}) => {
  try {
    // Generate a unique ID for the action item
    const actionItemId = doc(collection(db, 'temp')).id;
    
    // Use regular JavaScript Date instead of serverTimestamp for arrays
    const now = new Date();
    
    const actionItem: ActionItem = {
      id: actionItemId,
      description: actionItemData.description,
      assignedTo: actionItemData.assignedTo,
      assignedToName: actionItemData.assignedToName,
      dueDate: actionItemData.dueDate,
      status: actionItemData.status || 'pending',
      meetingId: actionItemData.meetingId,
      createdAt: now as any, // Use regular Date instead of serverTimestamp
      updatedAt: now as any  // Use regular Date instead of serverTimestamp
    };
    
    // Add the action item to the meeting's actionItems array
    const meetingRef = doc(db, 'meetings', actionItemData.meetingId);
    await updateDoc(meetingRef, {
      actionItems: arrayUnion(actionItem),
      updatedAt: serverTimestamp()
    });
    
    return actionItemId;
  } catch (error) {
    console.error("Error creating action item:", error);
    throw error;
  }
};

// Update an action item within a meeting
export const updateActionItem = async (
  actionItemId: string,
  meetingId: string,
  updates: Partial<{
    description: string;
    assignedTo: string;
    assignedToName: string;
    dueDate: string;
    status: 'pending' | 'in-progress' | 'completed';
  }>
) => {
  try {
    // Get the meeting
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      throw new Error("Meeting not found");
    }
    
    const meeting = meetingDoc.data() as Meeting;
    
    // Create a regular JavaScript Date instead of serverTimestamp for arrays
    const now = new Date();
    
    // Find and update the action item in actionItems array
    let updated = false;
    if (meeting.actionItems) {
      const updatedActionItems = meeting.actionItems.map(item => {
        if (item.id === actionItemId) {
          updated = true;
          return {
            ...item,
            ...updates,
            updatedAt: now as any // Use regular Date instead of serverTimestamp
          };
        }
        return item;
      });
      
      if (updated) {
        await updateDoc(meetingRef, {
          actionItems: updatedActionItems,
          updatedAt: serverTimestamp()
        });
        return true;
      }
    }
    
    // If not found in actionItems, check aiActionItems
    if (meeting.aiActionItems && !updated) {
      const updatedAiActionItems = meeting.aiActionItems.map(item => {
        if (item.id === actionItemId) {
          updated = true;
          return {
            ...item,
            ...updates,
            updatedAt: now as any // Use regular Date instead of serverTimestamp
          };
        }
        return item;
      });
      
      if (updated) {
        await updateDoc(meetingRef, {
          aiActionItems: updatedAiActionItems,
          updatedAt: serverTimestamp()
        });
        return true;
      }
    }
    
    if (!updated) {
      throw new Error("Action item not found");
    }
    
    return true;
  } catch (error) {
    console.error("Error updating action item:", error);
    throw error;
  }
};

// Delete an action item from a meeting
export const deleteActionItem = async (actionItemId: string, meetingId: string) => {
  try {
    // Get the meeting
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      throw new Error("Meeting not found");
    }
    
    const meeting = meetingDoc.data() as Meeting;
    
    // Remove from actionItems array
    if (meeting.actionItems) {
      const actionItemToRemove = meeting.actionItems.find(item => item.id === actionItemId);
      if (actionItemToRemove) {
        await updateDoc(meetingRef, {
          actionItems: arrayRemove(actionItemToRemove),
          updatedAt: serverTimestamp()
        });
        return true;
      }
    }
    
    // Remove from aiActionItems array
    if (meeting.aiActionItems) {
      const actionItemToRemove = meeting.aiActionItems.find(item => item.id === actionItemId);
      if (actionItemToRemove) {
        await updateDoc(meetingRef, {
          aiActionItems: arrayRemove(actionItemToRemove),
          updatedAt: serverTimestamp()
        });
        return true;
      }
    }
    
    throw new Error("Action item not found");
  } catch (error) {
    console.error("Error deleting action item:", error);
    throw error;
  }
};

// Get action item by ID from a specific meeting
export const getActionItemById = async (actionItemId: string, meetingId: string) => {
  try {
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      return null;
    }
    
    const meeting = meetingDoc.data() as Meeting;
    
    // Search in actionItems
    if (meeting.actionItems) {
      const actionItem = meeting.actionItems.find(item => item.id === actionItemId);
      if (actionItem) {
        return { ...actionItem, teamId: meeting.teamId, meetingTitle: meeting.title };
      }
    }
    
    // Search in aiActionItems
    if (meeting.aiActionItems) {
      const actionItem = meeting.aiActionItems.find(item => item.id === actionItemId);
      if (actionItem) {
        return { ...actionItem, teamId: meeting.teamId, meetingTitle: meeting.title };
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error getting action item:", error);
    throw error;
  }
};

// Get action items assigned to a specific user
export const getUserActionItems = async (userId: string, teamId: string) => {
  try {
    const allActionItems = await getTeamActionItems(teamId, userId);
    return allActionItems.filter(item => item.assignedTo === userId);
  } catch (error) {
    console.error("Error getting user action items:", error);
    throw error;
  }
};

// Update action item status
export const updateActionItemStatus = async (
  actionItemId: string, 
  meetingId: string,
  status: 'pending' | 'in-progress' | 'completed'
) => {
  try {
    return await updateActionItem(actionItemId, meetingId, { status });
  } catch (error) {
    console.error("Error updating action item status:", error);
    throw error;
  }
}; 