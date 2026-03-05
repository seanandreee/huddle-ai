import { useEffect, useState, useRef, FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  MessageSquare, 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Video,
  Trash,
  Edit,
  Save,
  X,
  Loader2,
  RefreshCw,
  Slack,
  Plus,
  User,
  CalendarIcon,
  MoreVertical,
  Play
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Meeting, getUserById, UserProfile, Comment, ActionItem, getTeamMembers, TeamMember, createActionItem, updateActionItem, deleteActionItem } from "@/lib/db";
import { deleteMeeting, updateMeeting, addCommentToMeeting, deleteComment, pollMeetingStatus, reprocessMeeting } from "@/lib/meetings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SlackNotification } from "@/components/SlackNotification";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MeetingDetails = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [allTeamMembers, setAllTeamMembers] = useState<UserProfile[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const pollingRef = useRef<boolean>(false);
  
  // Action Items CRUD state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isEditActionItemDialogOpen, setIsEditActionItemDialogOpen] = useState(false);
  const [editingActionItem, setEditingActionItem] = useState<ActionItem | null>(null);
  const [isActionItemLoading, setIsActionItemLoading] = useState(false);
  
  // Action Item Form state (only for editing)
  const [actionItemForm, setActionItemForm] = useState({
    description: "",
    assignedTo: "",
    assignedToName: "",
    dueDate: "",
    status: "pending" as "pending" | "in-progress" | "completed"
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    date: new Date(),
    participants: [] as string[]
  });

  // Team and Slack integration state
  const [teamData, setTeamData] = useState<any>(null);
  const [slackIntegration, setSlackIntegration] = useState<any>(null);

  const meetingId = searchParams.get("id");
  
  const startStatusPolling = async (id: string) => {
    if (pollingRef.current) return; // Already polling
    
    try {
      pollingRef.current = true;
      setIsPolling(true);
      setPollingError(null);
      
      console.log("Starting status polling for meeting:", id);
      
      const finalStatus = await pollMeetingStatus(
        id,
        async (status) => {
          console.log("Status update received:", status);
          
          // Refresh meeting data when status changes
          try {
            const meetingRef = doc(db, "meetings", id);
            const meetingDoc = await getDoc(meetingRef);
            
            if (meetingDoc.exists()) {
              const updatedMeetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
              setMeeting(updatedMeetingData);
              
              // Update comments if they exist
              if (updatedMeetingData.comments) {
                const sortedComments = [...updatedMeetingData.comments].sort((a, b) => {
                  const dateA = a.timestamp?.toDate?.() || new Date(0);
                  const dateB = b.timestamp?.toDate?.() || new Date(0);
                  return dateB.getTime() - dateA.getTime();
                });
                setComments(sortedComments);
              }
            }
          } catch (error) {
            console.error("Error refreshing meeting data during polling:", error);
          }
        }
      );
      
      console.log("Polling completed with final status:", finalStatus);
      
      if (finalStatus === 'processed') {
        toast({
          title: "Processing Complete!",
          description: "Your meeting has been successfully processed with AI insights."
        });
      } else if (finalStatus === 'failed') {
        toast({
          variant: "destructive",
          title: "Processing Failed",
          description: "There was an issue processing your meeting. You can try reprocessing it."
        });
      }
      
    } catch (error) {
      console.error("Polling error:", error);
      setPollingError(error instanceof Error ? error.message : "Failed to monitor processing status");
      toast({
        variant: "destructive",
        title: "Status Monitoring Error",
        description: "Unable to monitor processing status. Please refresh the page to check current status."
      });
    } finally {
      pollingRef.current = false;
      setIsPolling(false);
    }
  };
  
  useEffect(() => {
    if (!currentUser) {
      navigate("/login");
      return;
    }
    
    if (!meetingId) {
      setError("Meeting ID is missing");
      setLoading(false);
      return;
    }
    
    const fetchMeeting = async () => {
      try {
        setLoading(true);
        
        // Get meeting data
        const meetingRef = doc(db, "meetings", meetingId);
        const meetingDoc = await getDoc(meetingRef);
        
        if (!meetingDoc.exists()) {
          setError("Meeting not found");
          setLoading(false);
          return;
        }
        
        const meetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(meetingData);
        
        // Load comments if they exist
        if (meetingData.comments) {
          // Sort comments by timestamp (newest first)
          const sortedComments = [...meetingData.comments].sort((a, b) => {
            const dateA = a.timestamp?.toDate?.() || new Date(0);
            const dateB = b.timestamp?.toDate?.() || new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          setComments(sortedComments);
        }
        
        // Set edit form initial values
        setEditForm({
          title: meetingData.title,
          description: meetingData.description || "",
          date: meetingData.date.toDate(),
          participants: meetingData.participants || []
        });
        
        // Fetch participant info
        if (meetingData.participants && meetingData.participants.length > 0) {
          const participantProfiles = await Promise.all(
            meetingData.participants.map(async (id) => {
              try {
                const profile = await getUserById(id);
                return profile;
              } catch (err) {
                console.error(`Error fetching participant ${id}:`, err);
                return null;
              }
            })
          );
          
          // Filter out nulls
          const validProfiles = participantProfiles.filter(p => p !== null) as UserProfile[];
          setParticipants(validProfiles);
          
          // Set team members for edit dialog - using the same profiles
          setAllTeamMembers(validProfiles);
        }
        
        // Load team data
        if (meetingData.teamId) {
          // Load team information
          const teamRef = doc(db, "teams", meetingData.teamId);
          const teamDoc = await getDoc(teamRef);
          
          if (teamDoc.exists()) {
            const teamInfo = { id: teamDoc.id, ...teamDoc.data() };
            setTeamData(teamInfo);
            setSlackIntegration((teamInfo as any).slackIntegration || null);
            
            // Load team members for action items
            try {
              const members = await getTeamMembers(meetingData.teamId);
              setTeamMembers(members);
            } catch (error) {
              console.error("Error loading team members:", error);
            }
          }
        }
        
        // Start polling if meeting is still processing
        if ((meetingData.status === 'uploaded' || meetingData.status === 'processing') && !pollingRef.current) {
          startStatusPolling(meetingData.id);
        }
        
      } catch (err) {
        console.error("Error fetching meeting:", err);
        setError("Failed to load meeting details");
        toast({
          variant: "destructive",
          title: "Error",
          description: "There was a problem loading the meeting details."
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchMeeting();
    
    // Cleanup function to stop polling when component unmounts
    return () => {
      pollingRef.current = false;
    };
  }, [currentUser, meetingId, navigate, toast]);

  const formatDuration = (durationInSeconds?: number) => {
    if (!durationInSeconds) return "0 mins";
    
    const minutes = Math.floor(durationInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes > 0 ? remainingMinutes + 'm' : ''}`;
    } else {
      return `${minutes} mins`;
    }
  };
  
  const formatDate = (timestamp?: any) => {
    if (!timestamp) return "";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "PPP");
  };
  
  const formatCommentDate = (timestamp: any) => {
    if (!timestamp) return "";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  // Add a safe date formatting function for action items
  const formatActionItemDate = (timestamp: any) => {
    if (!timestamp) return "";
    
    try {
      // Handle Firestore Timestamp
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString();
      }
      // Handle JavaScript Date
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      // Handle string dates
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString();
      }
      return "";
    } catch (error) {
      console.error("Error formatting date:", error);
      return "";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed":
        return <Badge className="bg-green-100 text-green-800">✓ Processed</Badge>;
      case "processing":
        return (
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Processing
            </Badge>
            {isPolling && (
              <span className="text-xs text-gray-500">Live updates enabled</span>
            )}
          </div>
        );
      case "failed":
        return <Badge variant="destructive">✗ Failed</Badge>;
      case "uploaded":
        return (
          <div className="flex items-center gap-2">
            <Badge className="bg-yellow-100 text-yellow-800">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Uploaded - Starting Processing
            </Badge>
            {isPolling && (
              <span className="text-xs text-gray-500">Live updates enabled</span>
            )}
          </div>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleDeleteMeeting = async () => {
    if (!meetingId) return;
    
    try {
      setIsDeleting(true);
      
      await deleteMeeting(meetingId);
      
      toast({
        title: "Meeting deleted",
        description: "The meeting and all its associated data have been permanently deleted."
      });
      
      // Give the toast a moment to be seen before redirecting
      setTimeout(() => {
        // Navigate back to meetings list
        navigate("/team");
      }, 1500);
    } catch (error) {
      console.error("Error deleting meeting:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "There was a problem deleting the meeting."
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };
  
  const handleEditSave = async () => {
    if (!meetingId) return;
    
    try {
      await updateMeeting(meetingId, {
        title: editForm.title,
        description: editForm.description,
        date: editForm.date,
        participants: editForm.participants
      });
      
      toast({
        title: "Meeting updated",
        description: "Meeting details have been updated successfully."
      });
      
      // Refresh meeting data
      const meetingRef = doc(db, "meetings", meetingId);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const meetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(meetingData);
      }
      
      setShowEditDialog(false);
    } catch (error) {
      console.error("Error updating meeting:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "There was a problem updating the meeting."
      });
    }
  };
  
  const toggleParticipant = (participantId: string) => {
    setEditForm(prev => {
      if (prev.participants.includes(participantId)) {
        return {
          ...prev,
          participants: prev.participants.filter(id => id !== participantId)
        };
      } else {
        return {
          ...prev,
          participants: [...prev.participants, participantId]
        };
      }
    });
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim() || !meetingId || !currentUser) {
      return;
    }
    
    try {
      setIsAddingComment(true);
      
      await addCommentToMeeting(meetingId, newComment.trim());
      
      // Clear the input
      setNewComment("");
      
      // Refresh meeting data to get the new comment
      const meetingRef = doc(db, "meetings", meetingId);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const meetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        
        if (meetingData.comments) {
          // Sort comments by timestamp (newest first)
          const sortedComments = [...meetingData.comments].sort((a, b) => {
            const dateA = a.timestamp?.toDate?.() || new Date(0);
            const dateB = b.timestamp?.toDate?.() || new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          setComments(sortedComments);
        }
      }
      
      toast({
        title: "Comment added",
        description: "Your comment has been added to the meeting."
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "There was a problem adding your comment."
      });
    } finally {
      setIsAddingComment(false);
    }
  };
  
  const handleDeleteComment = async (commentId: string) => {
    if (!meetingId) return;
    
    try {
      await deleteComment(meetingId, commentId);
      
      // Update local state
      setComments(comments.filter(comment => comment.id !== commentId));
      
      toast({
        title: "Comment deleted",
        description: "Your comment has been deleted."
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "There was a problem deleting your comment."
      });
    }
  };
  
  const handleReprocess = async () => {
    if (!meetingId) return;
    
    try {
      setIsReprocessing(true);
      
      await reprocessMeeting(meetingId);
      
      toast({
        title: "Reprocessing started",
        description: "Your meeting is being reprocessed. This may take a few minutes."
      });
      
      // Start polling for status updates
      if (!pollingRef.current) {
        startStatusPolling(meetingId);
      }
    } catch (error) {
      console.error("Error reprocessing meeting:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "There was a problem reprocessing the meeting."
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleSlackNotificationSent = async () => {
    // Refresh meeting data to update the slack notification status
    if (meetingId) {
      const meetingRef = doc(db, "meetings", meetingId);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const updatedMeetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(updatedMeetingData);
      }
    }
  };

  // Action Items CRUD Functions
  const resetActionItemForm = () => {
    setActionItemForm({
      description: "",
      assignedTo: "",
      assignedToName: "",
      dueDate: "",
      status: "pending"
    });
  };

  const loadTeamMembers = async () => {
    if (!meeting?.teamId) return;
    
    try {
      const members = await getTeamMembers(meeting.teamId);
      setTeamMembers(members);
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  };

  const handleEditActionItem = (item: ActionItem) => {
    setEditingActionItem(item);
    setActionItemForm({
      description: item.description,
      assignedTo: item.assignedTo || "",
      assignedToName: item.assignedToName || "",
      dueDate: item.dueDate || "",
      status: item.status
    });
    setIsEditActionItemDialogOpen(true);
  };

  const handleUpdateActionItem = async () => {
    if (!editingActionItem || !meeting?.id) return;
    
    try {
      setIsActionItemLoading(true);
      
      if (!actionItemForm.description.trim()) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please enter a description for the action item."
        });
        return;
      }

      await updateActionItem(editingActionItem.id, meeting.id, {
        description: actionItemForm.description,
        assignedTo: actionItemForm.assignedTo || undefined,
        assignedToName: actionItemForm.assignedToName || undefined,
        dueDate: actionItemForm.dueDate || undefined,
        status: actionItemForm.status
      });

      toast({
        title: "Action item updated",
        description: "The action item has been successfully updated."
      });

      // Refresh meeting data
      const meetingRef = doc(db, "meetings", meeting.id);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const updatedMeetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(updatedMeetingData);
      }

      setIsEditActionItemDialogOpen(false);
      setEditingActionItem(null);
      resetActionItemForm();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error updating action item",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsActionItemLoading(false);
    }
  };

  const handleDeleteActionItem = async (item: ActionItem) => {
    if (!meeting?.id) return;
    
    try {
      setIsActionItemLoading(true);

      await deleteActionItem(item.id, meeting.id);

      toast({
        title: "Action item deleted",
        description: "The action item has been successfully deleted."
      });

      // Refresh meeting data
      const meetingRef = doc(db, "meetings", meeting.id);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const updatedMeetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(updatedMeetingData);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error deleting action item",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    } finally {
      setIsActionItemLoading(false);
    }
  };

  const handleStatusChange = async (item: ActionItem, newStatus: "pending" | "in-progress" | "completed") => {
    if (!meeting?.id) return;
    
    try {
      await updateActionItem(item.id, meeting.id, { status: newStatus });

      toast({
        title: "Status updated",
        description: `Action item marked as ${newStatus.replace('-', ' ')}.`
      });

      // Refresh meeting data
      const meetingRef = doc(db, "meetings", meeting.id);
      const meetingDoc = await getDoc(meetingRef);
      
      if (meetingDoc.exists()) {
        const updatedMeetingData = { id: meetingDoc.id, ...meetingDoc.data() } as Meeting;
        setMeeting(updatedMeetingData);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error updating status",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <Alert variant="destructive" className="max-w-md mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate("/team")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <Alert variant="destructive" className="max-w-md mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Meeting not found</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate("/team")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-4 py-3 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <Link to="/team" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <div className="flex space-x-2">
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Meeting</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this meeting? This will permanently remove:
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-3">
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>The meeting recording from storage</li>
                  <li>The meeting transcript (if available)</li>
                  <li>All meeting details and metadata</li>
                  <li>All comments and action items</li>
                </ul>
                <p className="mt-3 text-sm text-red-600 font-medium">This action cannot be undone.</p>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteMeeting}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete Everything"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Meeting Details</DialogTitle>
                <DialogDescription>
                  Make changes to the meeting information here.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Meeting Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !editForm.date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editForm.date ? format(editForm.date, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={editForm.date}
                        onSelect={(date) => date && setEditForm({ ...editForm, date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label>Participants</Label>
                  <div className="border rounded-md p-4 max-h-[200px] overflow-y-auto">
                    {allTeamMembers.map((member) => (
                      <div key={member.uid} className="flex items-center space-x-2 mb-2">
                        <Checkbox
                          id={`member-${member.uid}`}
                          checked={editForm.participants.includes(member.uid)}
                          onCheckedChange={() => toggleParticipant(member.uid)}
                        />
                        <Label htmlFor={`member-${member.uid}`}>{member.displayName}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleEditSave}>
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Link to="/team">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Top Section - Meeting Header with Key Info */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row justify-between">
            {/* Left side - Title and basic info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 text-gray-400 mr-1" />
                  <span className="text-gray-600 text-sm">{formatDate(meeting.date)}</span>
                </div>
                
                <div className="flex items-center">
                  <Clock className="w-4 h-4 text-gray-400 mr-1" />
                  <span className="text-gray-600 text-sm">{formatDuration(meeting.duration)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusBadge(meeting.status)}
                  {meeting.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReprocess}
                      disabled={isReprocessing}
                      className="text-xs h-6"
                    >
                      {isReprocessing ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Reprocessing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Reprocess
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center">
                  <span className="text-gray-600 text-sm">Uploaded by: {meeting.uploadedByName}</span>
                </div>
              </div>
            </div>

            {/* Right side - Participants */}
            <div className="mt-4 md:mt-0 md:ml-4">
              <p className="text-sm font-medium text-gray-500 mb-1">Participants ({participants.length})</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {participants.length > 0 ? (
                  participants.map((participant) => (
                    <Avatar key={participant.uid} className="h-8 w-8 border-2 border-white" title={participant.displayName}>
                      <AvatarImage src={participant.photoURL || ''} />
                      <AvatarFallback>
                        {participant.displayName 
                          ? participant.displayName.split(' ').map(n => n[0]).join('').toUpperCase() 
                          : participant.email?.substring(0, 2).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No participants recorded</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Video Player - Left Column */}
          <div className="lg:col-span-2">
            {meeting.recordingUrl ? (
              <Card className="border-0 shadow-md overflow-hidden h-full">
                <CardContent className="p-0">
                  <video 
                    ref={videoRef}
                    src={meeting.recordingUrl} 
                    controls 
                    className="w-full h-auto rounded-t-md"
                    poster="/video-thumbnail.jpg"
                  />
                </CardContent>
                <CardFooter className="bg-gray-50 px-4 py-2">
                  <div className="flex items-center space-x-2 text-sm text-gray-700">
                    <Video className="w-4 h-4 text-blue-500" />
                    <span>Meeting Recording</span>
                  </div>
                </CardFooter>
              </Card>
            ) : (
              <Card className="border-0 shadow-md flex items-center justify-center h-full">
                <CardContent className="text-center p-6">
                  <div className="rounded-full bg-gray-100 p-4 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
                    <Video className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-700 mb-1">No Recording Available</h3>
                  <p className="text-sm text-gray-500">This meeting doesn't have a video recording</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Summary - Right Column */}
          <div>
            <Card className="border-0 shadow-md h-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center text-lg">
                  <MessageSquare className="w-5 h-5 mr-2 text-purple-500" />
                  AI Summary
                </CardTitle>
                <CardDescription>
                  AI-generated meeting overview and insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(meeting.status === 'processing' || meeting.status === 'uploaded') ? (
                  <div className="flex items-center justify-center py-6 text-center">
                    <div>
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      <p className="text-gray-500 text-sm">
                        {meeting.status === 'uploaded' 
                          ? 'Starting AI processing...' 
                          : 'Your meeting is being processed...'}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">This may take a few minutes</p>
                      {isPolling && (
                        <p className="text-blue-500 text-xs mt-2 flex items-center justify-center gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          Live updates enabled
                        </p>
                      )}
                      {pollingError && (
                        <p className="text-red-500 text-xs mt-2">
                          Status monitoring error - please refresh to check progress
                        </p>
                      )}
                    </div>
                  </div>
                ) : meeting.status === 'failed' ? (
                  <div className="space-y-3">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Processing Failed</AlertTitle>
                      <AlertDescription>There was a problem processing this meeting.</AlertDescription>
                    </Alert>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReprocess}
                      disabled={isReprocessing}
                      className="w-full"
                    >
                      {isReprocessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Reprocessing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Try Reprocessing
                        </>
                      )}
                    </Button>
                  </div>
                ) : meeting.aiSummary ? (
                  <div className="prose max-w-none">
                    <p className="text-gray-700 text-sm leading-relaxed">{meeting.aiSummary}</p>
                  </div>
                ) : meeting.summary ? (
                  <div className="prose max-w-none">
                    <p className="text-gray-700 text-sm">{meeting.summary}</p>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4 text-sm">No summary available</p>
                )}
                
                {meeting.description && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
                    <p className="text-gray-700 text-sm">{meeting.description}</p>
                  </div>
                )}
                
                {meeting.transcript && (
                  <div className="mt-4">
                    <Button 
                      variant="outline" 
                      className="w-full text-sm h-8"
                      onClick={() => {
                        const transcriptSection = document.querySelector('[data-transcript-section]');
                        transcriptSection?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      View Full Transcript
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Action Items Section */}
        <Card className="border-0 shadow-md mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center text-lg">
                  <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
                  Action Items
                </CardTitle>
                <CardDescription>
                  Tasks and follow-ups generated from this meeting
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(meeting.status === 'processing' || meeting.status === 'uploaded') ? (
              <div className="flex items-center justify-center py-6 text-center">
                <div>
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-500 text-sm">
                    {meeting.status === 'uploaded' 
                      ? 'Starting AI processing...' 
                      : 'Your meeting is being processed...'}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">Action items will appear here once processing is complete</p>
                  {isPolling && (
                    <p className="text-blue-500 text-xs mt-2 flex items-center justify-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      Live updates enabled
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* AI Generated Action Items */}
                {meeting.aiActionItems && meeting.aiActionItems.length > 0 && (
                  <div className="mb-6">
                    <div className="space-y-3">
                      {meeting.aiActionItems.map((item, index) => (
                        <div key={`ai-${index}`} className="p-4 border rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-gray-800 font-medium text-sm mb-2">{item.description}</p>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {item.assignedToName && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                    Assigned to: {item.assignedToName}
                                  </span>
                                )}
                                {item.dueDate && (
                                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                                    Due: {new Date(item.dueDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-3">
                              <Badge variant="secondary" className="text-xs">
                                {item.status === 'completed' ? 'Completed' : 
                                 item.status === 'in-progress' ? 'In Progress' : 'Pending'}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <MoreVertical className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {item.status !== 'pending' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(item, 'pending')}>
                                      <Clock className="w-4 h-4 mr-2" />
                                      Mark as Pending
                                    </DropdownMenuItem>
                                  )}
                                  {item.status !== 'in-progress' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(item, 'in-progress')}>
                                      <Play className="w-4 h-4 mr-2" />
                                      Mark as In Progress
                                    </DropdownMenuItem>
                                  )}
                                  {item.status !== 'completed' && (
                                    <DropdownMenuItem onClick={() => handleStatusChange(item, 'completed')}>
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                      Mark as Completed
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleEditActionItem(item)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteActionItem(item)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {(!meeting.aiActionItems || meeting.aiActionItems.length === 0) && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm mb-2">No action items yet</p>
                    <p className="text-gray-400 text-xs mb-4">
                      Action items will be automatically generated from AI processing
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Topics Discussed */}
        {meeting.status === 'processed' && meeting.topicsDiscussed && meeting.topicsDiscussed.length > 0 && (
          <Card className="border-0 shadow-md mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <Users className="w-5 h-5 mr-2 text-blue-500" />
                Topics Discussed
              </CardTitle>
              <CardDescription>
                Key themes and subjects covered
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {meeting.topicsDiscussed.map((topic, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-gray-700 text-sm">{topic}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Work Done and Decisions */}
        {meeting.status === 'processed' && (meeting.workDone?.length || meeting.decisionsMade?.length) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Work Already Done */}
            {meeting.workDone && meeting.workDone.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-lg">
                    <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
                    Work Completed
                  </CardTitle>
                  <CardDescription>
                    Tasks and accomplishments mentioned
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {meeting.workDone.map((work, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700 text-sm">{work}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Decisions Made */}
            {meeting.decisionsMade && meeting.decisionsMade.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-lg">
                    <AlertCircle className="w-5 h-5 mr-2 text-orange-500" />
                    Decisions Made
                  </CardTitle>
                  <CardDescription>
                    Key decisions and approvals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {meeting.decisionsMade.map((decision, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-gray-700 text-sm">{decision}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Follow-up Questions */}
        {meeting.status === 'processed' && meeting.followUpQuestions?.length && (
          <Card className="border-0 shadow-md mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <MessageSquare className="w-5 h-5 mr-2 text-yellow-500" />
                Follow-up Questions
              </CardTitle>
              <CardDescription>
                Unresolved questions and concerns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {meeting.followUpQuestions.map((question, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-gray-700 text-sm">{question}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Transcript Section */}
        {meeting.status === 'processed' && meeting.transcript && (
          <Card className="border-0 shadow-md mb-6" data-transcript-section>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <FileText className="w-5 h-5 mr-2 text-gray-500" />
                Meeting Transcript
              </CardTitle>
              <CardDescription>
                Full transcript of the meeting conversation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed">
                  {meeting.transcript}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Other Observations */}
        {meeting.status === 'processed' && meeting.otherObservations && (
          <Card className="border-0 shadow-md mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <FileText className="w-5 h-5 mr-2 text-gray-500" />
                Other Observations
              </CardTitle>
              <CardDescription>
                Additional insights from AI analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <p className="text-gray-700 text-sm leading-relaxed">{meeting.otherObservations}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Comments Section */}
        <Card className="border-0 shadow-md mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <MessageSquare className="w-5 h-5 mr-2 text-blue-500" />
              Comments
            </CardTitle>
            <CardDescription>
              Discuss this meeting with your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="mb-6">
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={currentUser?.photoURL || ''} />
                  <AvatarFallback>
                    {currentUser?.displayName 
                      ? currentUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase() 
                      : currentUser?.email?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea
                    ref={commentInputRef}
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[80px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddComment(e);
                      }
                    }}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">
                      Press Cmd+Enter to post
                    </p>
                    <Button 
                      type="submit" 
                      size="sm"
                      disabled={!newComment.trim() || isAddingComment}
                    >
                      {isAddingComment ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        'Post Comment'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </form>

            {/* Comments List */}
            <div className="space-y-4">
              {comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={comment.userPhotoURL || ''} />
                      <AvatarFallback>
                        {comment.userName 
                          ? comment.userName.split(' ').map(n => n[0]).join('').toUpperCase() 
                          : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{comment.userName}</span>
                          <span className="text-xs text-gray-500">
                            {comment.timestamp?.toDate ? format(comment.timestamp.toDate(), 'PPp') : 'Unknown time'}
                          </span>
                        </div>
                        {comment.userId === currentUser?.uid && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteComment(comment.id)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-2">No comments yet</p>
                  <p className="text-sm text-gray-400">Be the first to share your thoughts about this meeting</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Slack Integration Section */}
        {meeting.status === 'processed' && (
          <div className="mb-6">
            <SlackNotification
              meetingId={meeting.id}
              teamId={meeting.teamId || ''}
              meetingTitle={meeting.title}
              slackIntegration={slackIntegration}
              notificationStatus={{
                sent: meeting.slackNotificationSent || false,
                sentAt: meeting.slackNotificationSentAt,
                sentBy: meeting.slackNotificationSentBy
              }}
              onNotificationSent={handleSlackNotificationSent}
            />
          </div>
        )}

        {/* Edit Action Item Dialog */}
        <Dialog open={isEditActionItemDialogOpen} onOpenChange={setIsEditActionItemDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Edit Action Item</DialogTitle>
              <DialogDescription>
                Update the action item details below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Enter action item description..."
                  value={actionItemForm.description}
                  onChange={(e) => setActionItemForm(prev => ({ ...prev, description: e.target.value }))}
                  className="min-h-[80px]"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-assignedTo">Assign to</Label>
                  <Select 
                    value={actionItemForm.assignedTo || "unassigned"} 
                    onValueChange={(value) => {
                      const member = teamMembers.find(m => m.uid === value);
                      setActionItemForm(prev => ({ 
                        ...prev, 
                        assignedTo: value === "unassigned" ? "" : value,
                        assignedToName: value === "unassigned" ? "" : (member?.displayName || "")
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.uid} value={member.uid}>
                          {member.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={actionItemForm.status} 
                    onValueChange={(value: "pending" | "in-progress" | "completed") => 
                      setActionItemForm(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-dueDate">Due Date (Optional)</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={actionItemForm.dueDate}
                  onChange={(e) => setActionItemForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditActionItemDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateActionItem} disabled={isActionItemLoading}>
                {isActionItemLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update Action Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default MeetingDetails;


