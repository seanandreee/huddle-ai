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
  serverTimestamp, 
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { db, storage } from './firebase';
import { auth } from './firebase';
import { Meeting, UserProfile, getUserById } from './db';

export interface MeetingUploadData {
  title: string;
  description?: string;
  teamId: string;
  date: Date;
  participants: string[]; // Array of userIds or emails
  file: File;
}

export interface UploadProgress {
  progress: number;
  state: 'uploading' | 'processing' | 'complete' | 'error';
  meetingId?: string;
  error?: string;
}

/**
 * Upload a meeting recording and save meeting data to Firestore
 */
export const uploadMeeting = async (
  meetingData: MeetingUploadData,
  progressCallback?: (progress: UploadProgress) => void
): Promise<string> => {
  try {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    
    const currentUser = auth.currentUser;
    const userProfile = await getUserById(currentUser.uid);
    
    if (!userProfile) {
      throw new Error("User profile not found");
    }
    
    // Create a unique ID for the meeting
    const meetingId = uuidv4();
    
    // Create a reference to the file in Firebase Storage
    const fileExtension = meetingData.file.name.split('.').pop();
    const filePath = `meetings/${meetingData.teamId}/${meetingId}.${fileExtension}`;
    const storageRef = ref(storage, filePath);
    
    // Start uploading the file
    const uploadTask = uploadBytesResumable(storageRef, meetingData.file);
    
    // Create the meeting document in Firestore
    const meetingsRef = collection(db, 'meetings');
    const meetingRef = doc(meetingsRef, meetingId);
    
    // Initial meeting data
    const timestamp = serverTimestamp();
    const meetingMetadata: Omit<Meeting, 'id'> = {
      title: meetingData.title,
      description: meetingData.description || '',
      teamId: meetingData.teamId,
      uploadedBy: currentUser.uid,
      uploadedByName: userProfile.displayName,
      date: Timestamp.fromDate(meetingData.date),
      duration: 0, // Will be updated after processing
      participants: meetingData.participants,
      status: 'uploaded',
      createdAt: timestamp as Timestamp,
      updatedAt: timestamp as Timestamp
    };
    
    // Save initial meeting data
    await setDoc(meetingRef, meetingMetadata);
    
    if (progressCallback) {
      progressCallback({
        progress: 0,
        state: 'uploading',
        meetingId
      });
    }
    
    // Return a promise that resolves when the upload is complete
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        // Progress callback
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (progressCallback) {
            progressCallback({
              progress,
              state: 'uploading',
              meetingId
            });
          }
        },
        // Error callback
        (error) => {
          console.error("Upload failed:", error);
          // Update meeting status to failed
          updateDoc(meetingRef, {
            status: 'failed',
            error: error.message,
            updatedAt: serverTimestamp()
          });
          
          if (progressCallback) {
            progressCallback({
              progress: 0,
              state: 'error',
              meetingId,
              error: error.message
            });
          }
          
          reject(error);
        },
        // Success callback
        async () => {
          try {
            // Get the download URL
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            // Update the meeting doc with the recording URL
            await updateDoc(meetingRef, {
              recordingUrl: downloadURL,
              status: 'uploaded', // Cloud function will change this to 'processing' when it starts
              updatedAt: serverTimestamp()
            });
            
            if (progressCallback) {
              progressCallback({
                progress: 100,
                state: 'processing',
                meetingId
              });
            }
            
            // The cloud function will automatically process the uploaded file
            // No need to simulate processing here
            resolve(meetingId);
          } catch (error) {
            console.error("Error updating meeting after upload:", error);
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error("Error uploading meeting:", error);
    throw error;
  }
};

/**
 * Get the status of a meeting
 */
export const getMeetingStatus = async (meetingId: string): Promise<'uploaded' | 'processing' | 'processed' | 'failed'> => {
  try {
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (meetingDoc.exists()) {
      return meetingDoc.data().status;
    } else {
      throw new Error("Meeting not found");
    }
  } catch (error) {
    console.error("Error getting meeting status:", error);
    throw error;
  }
};

/**
 * Manually reprocess a failed meeting using cloud functions
 */
export const reprocessMeeting = async (meetingId: string): Promise<void> => {
  try {
    // Import functions dynamically to avoid issues if not available
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    
    const functions = getFunctions();
    const reprocessFunction = httpsCallable(functions, 'reprocessMeeting');
    
    const result = await reprocessFunction({ meetingId });
    const data = result.data as { success: boolean; message?: string };
    
    if (!data.success) {
      throw new Error(data.message || 'Reprocessing failed');
    }
  } catch (error) {
    console.error("Error reprocessing meeting:", error);
    throw error;
  }
};

/**
 * Poll meeting status until processing is complete
 */
export const pollMeetingStatus = async (
  meetingId: string,
  onStatusChange?: (status: string) => void,
  maxAttempts: number = 360, // 30 minutes with 5-second intervals (increased from 5 minutes)
  interval: number = 5000
): Promise<'processed' | 'failed'> => {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const checkStatus = async () => {
      try {
        attempts++;
        const status = await getMeetingStatus(meetingId);
        
        if (onStatusChange) {
          onStatusChange(status);
        }
        
        if (status === 'processed' || status === 'failed') {
          resolve(status);
          return;
        }
        
        if (attempts >= maxAttempts) {
          reject(new Error('Polling timeout: Meeting processing took too long. Please check the meeting details page or try reprocessing.'));
          return;
        }
        
        // Continue polling
        setTimeout(checkStatus, interval);
      } catch (error) {
        reject(error);
      }
    };
    
    checkStatus();
  });
};

/**
 * Get team members for participant selection
 */
export const getTeamMembersForSelect = async (teamId: string): Promise<{ id: string; name: string }[]> => {
  try {
    const teamRef = doc(db, 'teams', teamId);
    const teamDoc = await getDoc(teamRef);
    
    if (!teamDoc.exists()) {
      throw new Error("Team not found");
    }
    
    const team = teamDoc.data();
    const memberIds = team.members || [];
    
    // Get user profiles for each member
    const members: { id: string; name: string }[] = [];
    
    for (const memberId of memberIds) {
      const userProfile = await getUserById(memberId);
      if (userProfile) {
        members.push({
          id: memberId,
          name: userProfile.displayName
        });
      }
    }
    
    return members;
  } catch (error) {
    console.error("Error getting team members for select:", error);
    throw error;
  }
};

/**
 * Delete a meeting and its associated data
 */
export const deleteMeeting = async (meetingId: string): Promise<boolean> => {
  try {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    
    // Get the meeting data first to get the file path
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      throw new Error("Meeting not found");
    }
    
    const meetingData = meetingDoc.data() as Meeting;
    
    // Delete the recording file from storage if it exists
    if (meetingData.recordingUrl) {
      try {
        // Extract the file path from the URL
        const fileUrl = new URL(meetingData.recordingUrl);
        const filePath = decodeURIComponent(fileUrl.pathname.split('/o/')[1].split('?')[0]);
        const fileRef = ref(storage, filePath);
        
        await deleteObject(fileRef);
        console.log("Meeting recording deleted from storage");
      } catch (storageError) {
        console.error("Error deleting meeting recording:", storageError);
        // Continue with deletion of the document even if file deletion fails
      }
    }
    
    // Delete the transcript file if it exists
    if (meetingData.transcriptUrl) {
      try {
        const fileUrl = new URL(meetingData.transcriptUrl);
        const filePath = decodeURIComponent(fileUrl.pathname.split('/o/')[1].split('?')[0]);
        const fileRef = ref(storage, filePath);
        
        await deleteObject(fileRef);
        console.log("Meeting transcript deleted from storage");
      } catch (storageError) {
        console.error("Error deleting meeting transcript:", storageError);
        // Continue with deletion even if transcript deletion fails
      }
    }
    
    // Delete the meeting document from Firestore
    await deleteDoc(meetingRef);
    console.log("Meeting document deleted from Firestore");
    
    return true;
  } catch (error) {
    console.error("Error deleting meeting:", error);
    throw error;
  }
};

/**
 * Update meeting details
 */
export interface MeetingUpdateData {
  title?: string;
  description?: string;
  date?: Date;
  participants?: string[];
}

export const updateMeeting = async (meetingId: string, updateData: MeetingUpdateData): Promise<boolean> => {
  try {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      throw new Error("Meeting not found");
    }
    
    const updateObject: Record<string, any> = {
      updatedAt: serverTimestamp()
    };
    
    if (updateData.title) {
      updateObject.title = updateData.title;
    }
    
    if (updateData.description !== undefined) {
      updateObject.description = updateData.description;
    }
    
    if (updateData.date) {
      updateObject.date = Timestamp.fromDate(updateData.date);
    }
    
    if (updateData.participants) {
      updateObject.participants = updateData.participants;
    }
    
    await updateDoc(meetingRef, updateObject);
    
    return true;
  } catch (error) {
    console.error("Error updating meeting:", error);
    throw error;
  }
};

/**
 * Add a comment to a meeting
 */
export const addCommentToMeeting = async (meetingId: string, commentText: string): Promise<string> => {
  try {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    
    const currentUser = auth.currentUser;
    const userProfile = await getUserById(currentUser.uid);
    
    if (!userProfile) {
      throw new Error("User profile not found");
    }
    
    const commentId = uuidv4();
    const meetingRef = doc(db, 'meetings', meetingId);
    
    // Use regular JavaScript Date instead of serverTimestamp for arrays
    const now = new Date();
    
    const comment = {
      id: commentId,
      userId: currentUser.uid,
      userName: userProfile.displayName,
      userPhotoURL: userProfile.photoURL || null,
      text: commentText,
      timestamp: now as any // Use regular Date instead of serverTimestamp
    };
    
    await updateDoc(meetingRef, {
      comments: arrayUnion(comment),
      updatedAt: serverTimestamp()
    });
    
    return commentId;
  } catch (error) {
    console.error("Error adding comment:", error);
    throw error;
  }
};

/**
 * Delete a comment from a meeting
 */
export const deleteComment = async (meetingId: string, commentId: string): Promise<boolean> => {
  try {
    if (!auth.currentUser) {
      throw new Error("User not authenticated");
    }
    
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingDoc = await getDoc(meetingRef);
    
    if (!meetingDoc.exists()) {
      throw new Error("Meeting not found");
    }
    
    const meetingData = meetingDoc.data();
    const comments = meetingData.comments || [];
    const updatedComments = comments.filter((comment: any) => comment.id !== commentId);
    
    await updateDoc(meetingRef, {
      comments: updatedComments,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error("Error deleting comment:", error);
    throw error;
  }
}; 