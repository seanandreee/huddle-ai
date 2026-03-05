import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileVideo, MessageSquare, ArrowLeft, Calendar, Users, Check, AlertCircle, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getUserTeams, getTeamById } from "@/lib/db";
import { uploadMeeting, getTeamMembersForSelect, MeetingUploadData, UploadProgress, pollMeetingStatus } from "@/lib/meetings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface TeamMember {
  id: string;
  name: string;
}

const MeetingUpload = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  
  const [meetingData, setMeetingData] = useState({
    title: "",
    description: "",
    file: null as File | null
  });

  useEffect(() => {
    const loadTeamData = async () => {
      if (!currentUser) {
        navigate("/login");
        return;
      }
      
      try {
        setIsLoading(true);
        
        // Get user's current team
        const userTeams = await getUserTeams(currentUser.uid);
        
        if (!userTeams.currentTeam) {
          navigate("/team-setup");
          return;
        }
        
        const currentTeamId = userTeams.currentTeam;
        setTeamId(currentTeamId);
        
        // Load team info
        const team = await getTeamById(currentTeamId);
        
        if (!team) {
          toast({
            variant: "destructive",
            title: "Team not found",
            description: "We couldn't find your team. Please try again."
          });
          navigate("/team");
          return;
        }
        
        setTeamName(team.name);
        
        // Load team members for participant selection
        const members = await getTeamMembersForSelect(currentTeamId);
        setTeamMembers(members);
        
        // Add current user to selected participants by default
        const currentUserId = currentUser.uid;
        setSelectedParticipants([currentUserId]);
        
      } catch (error) {
        console.error("Error loading team data:", error);
        toast({
          variant: "destructive",
          title: "Failed to load team data",
          description: "There was a problem loading your team information."
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadTeamData();
  }, [currentUser, navigate, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (1GB = 1024 * 1024 * 1024 bytes)
      const maxSizeBytes = 1024 * 1024 * 1024; // 1GB
      if (file.size > maxSizeBytes) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select a file smaller than 1GB."
        });
        return;
      }
      
      setMeetingData(prev => ({ ...prev, file }));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!meetingData.file) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please select a meeting recording to upload."
      });
      return;
    }
    
    if (selectedParticipants.length === 0) {
      toast({
        variant: "destructive",
        title: "No participants selected",
        description: "Please select at least one meeting participant."
      });
      return;
    }
    
    try {
      setIsUploading(true);
      
      const data: MeetingUploadData = {
        title: meetingData.title,
        description: meetingData.description,
        teamId,
        date: selectedDate,
        participants: selectedParticipants,
        file: meetingData.file
      };
      
      // Upload the meeting
      const meetingId = await uploadMeeting(data, (progress) => {
        setUploadProgress(progress);
      });
      
      // If we get here, the initial upload was successful
      toast({
        title: "Meeting uploaded successfully",
        description: "Your meeting is now being processed. You can view its progress on the meeting details page."
      });
      
      // Update progress to show processing state
      setUploadProgress(prev => ({
        ...prev,
        progress: 100,
        state: 'processing',
        meetingId
      }));
      
      // Navigate to meeting details immediately after successful upload
      // Don't wait for processing to complete
      setTimeout(() => {
        navigate(`/meeting-details?id=${meetingId}`);
      }, 2000);
      
    } catch (error) {
      console.error("Error uploading meeting:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was a problem uploading your meeting."
      });
      setIsUploading(false);
    }
  };

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipants(prev => {
      if (prev.includes(participantId)) {
        return prev.filter(id => id !== participantId);
      } else {
        return [...prev, participantId];
      }
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <Link to="/team" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <Link to="/team">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </nav>

      <div className="px-6 py-8 max-w-2xl mx-auto">
        {isUploading ? (
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Uploading Meeting</CardTitle>
              <CardDescription>
                {uploadProgress?.state === 'processing' 
                  ? 'Processing your meeting recording...' 
                  : 'Uploading your meeting recording...'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={uploadProgress?.progress || 0} className="h-2" />
              
              <div className="text-center">
                {uploadProgress?.state === 'uploading' && (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p>Uploading file: {Math.round(uploadProgress?.progress || 0)}%</p>
                  </div>
                )}
                
                {uploadProgress?.state === 'processing' && (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    <p>Processing your meeting recording...</p>
                    <p className="text-sm text-gray-500">This might take a few minutes</p>
                  </div>
                )}
                
                {uploadProgress?.state === 'complete' && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-green-100 p-3">
                      <Check className="h-8 w-8 text-green-600" />
                    </div>
                    <p>Processing complete!</p>
                    <p className="text-sm text-gray-500">Redirecting to meeting details page...</p>
                  </div>
                )}
                
                {uploadProgress?.state === 'error' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {uploadProgress.error || "There was a problem uploading your meeting."}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Upload Meeting Recording</CardTitle>
              <CardDescription>
                Upload your meeting recording to get AI-powered transcription and insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Meeting Title <span className="text-red-500">*</span></Label>
                  <Input
                    id="title"
                    placeholder="Daily Standup - Sprint 24"
                    value={meetingData.title}
                    onChange={(e) => setMeetingData(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Add any notes about this meeting..."
                    value={meetingData.description}
                    onChange={(e) => setMeetingData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Meeting Date <span className="text-red-500">*</span></Label>
                  <div className="flex">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Participants <span className="text-red-500">*</span></Label>
                  <div className="border rounded-md p-4 space-y-4">
                    <div className="text-sm text-gray-500 mb-2 flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>Select team members who attended this meeting</span>
                    </div>
                    
                    {teamMembers.length > 0 ? (
                      <div className="space-y-3">
                        {teamMembers.map((member) => (
                          <div key={member.id} className="flex items-center space-x-3">
                            <Checkbox 
                              id={`member-${member.id}`}
                              checked={selectedParticipants.includes(member.id)}
                              onCheckedChange={() => toggleParticipant(member.id)}
                            />
                            <Label
                              htmlFor={`member-${member.id}`}
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              {member.name}
                              {member.id === currentUser?.uid && (
                                <span className="ml-2 text-xs text-gray-500">(You)</span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-sm text-gray-500">No team members found</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">Recording File <span className="text-red-500">*</span></Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <input
                      id="file"
                      name="meeting-recording"
                      type="file"
                      accept="video/*,audio/*"
                      onChange={handleFileChange}
                      className="hidden"
                      required
                    />
                    <label htmlFor="file" className="cursor-pointer">
                      <FileVideo className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-lg font-medium text-gray-700 mb-2">
                        {meetingData.file ? meetingData.file.name : "Choose a file or drag it here"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports MP4, MOV, AVI, MP3, WAV files up to 1GB
                      </p>
                    </label>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <Link to="/team" className="flex-1">
                    <Button variant="outline" className="w-full">Cancel</Button>
                  </Link>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload & Process
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MeetingUpload;
