import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, ArrowLeft, Search, Upload, Calendar, Clock, Users, MoreVertical, Filter, CheckCircle2, FileText, Play, Download, Share2, Edit3, Trash2, AlertCircle, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMeetings } from "@/hooks/useMeetings";
import { getUserTeams, getTeamById, Team as TeamType, Meeting } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { Timestamp } from "firebase/firestore";

const MeetingManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "uploaded" | "processing" | "processed" | "failed">("all");
  const [currentTeam, setCurrentTeam] = useState<TeamType | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  
  // Load current team
  useEffect(() => {
    const loadCurrentTeam = async () => {
      if (!currentUser) {
        navigate("/login");
        return;
      }
      
      try {
        setIsLoadingTeam(true);
        const userTeams = await getUserTeams(currentUser.uid);
        
        if (!userTeams.currentTeam) {
          navigate("/team-setup");
          return;
        }
        
        const team = await getTeamById(userTeams.currentTeam);
        if (team) {
          setCurrentTeam(team);
        } else {
          toast({
            variant: "destructive",
            title: "Team not found",
            description: "We couldn't find your team. Please create or join a team."
          });
          navigate("/team-setup");
        }
      } catch (error) {
        console.error("Error loading team:", error);
        toast({
          variant: "destructive",
          title: "Error loading team",
          description: "There was a problem accessing your team information."
        });
      } finally {
        setIsLoadingTeam(false);
      }
    };
    
    loadCurrentTeam();
  }, [currentUser, navigate, toast]);

  // Use the custom hook for meetings data
  const { 
    meetings, 
    isLoading: isLoadingMeetings, 
    error: meetingsError,
    refetch: refetchMeetings 
  } = useMeetings({
    teamId: currentTeam?.id || "",
    userId: currentUser?.uid,
    orderByField: "date",
    orderDirection: "desc",
    statusFilter: selectedFilter === "all" ? undefined : selectedFilter
  });

  // Filter meetings based on search term
  const filteredMeetings = meetings.filter(meeting => {
    const searchLower = searchTerm.toLowerCase();
    return (
      meeting.title.toLowerCase().includes(searchLower) ||
      meeting.uploadedByName.toLowerCase().includes(searchLower) ||
      (meeting.description && meeting.description.toLowerCase().includes(searchLower)) ||
      (meeting.topicsDiscussed && meeting.topicsDiscussed.some(topic => 
        topic.toLowerCase().includes(searchLower)
      ))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed": return <Badge className="bg-green-100 text-green-800 text-xs">Processed</Badge>;
      case "processing": return <Badge className="bg-blue-100 text-blue-800 text-xs">Processing</Badge>;
      case "uploaded": return <Badge className="bg-yellow-100 text-yellow-800 text-xs">Uploaded</Badge>;
      case "failed": return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default: return <Badge variant="secondary" className="text-xs">Unknown</Badge>;
    }
  };

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case "very-positive": return "text-green-600";
      case "positive": return "text-green-500";
      case "neutral": return "text-gray-500";
      case "negative": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getStatusCount = (status: string) => {
    return meetings.filter(m => m.status === status).length;
  };
  
  const handleNavigateToMeeting = (meetingId: string) => {
    navigate(`/meeting-details?id=${meetingId}`);
  };

  const handleFilterChange = (filter: "all" | "uploaded" | "processing" | "processed" | "failed") => {
    setSelectedFilter(filter);
  };

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (durationInSeconds: number) => {
    if (durationInSeconds === 0) return "0 mins";
    
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}mins`;
    }
    return `${minutes} mins`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getKeyPoints = (meeting: Meeting): string[] => {
    const points: string[] = [];
    
    if (meeting.topicsDiscussed && meeting.topicsDiscussed.length > 0) {
      points.push(...meeting.topicsDiscussed.slice(0, 2));
    }
    
    if (meeting.decisionsMade && meeting.decisionsMade.length > 0 && points.length < 2) {
      points.push(...meeting.decisionsMade.slice(0, 2 - points.length));
    }
    
    return points;
  };

  // Loading state
  if (isLoadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg p-8">
          <div className="flex items-center space-x-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Loading team...</h3>
              <p className="text-sm text-gray-600">Please wait while we load your team information.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (meetingsError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
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
              Back
            </Button>
          </Link>
        </nav>
        
        <div className="px-6 py-8 max-w-7xl mx-auto">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-8 pb-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading meetings</h3>
              <p className="text-gray-600 mb-4">{meetingsError}</p>
              <Button onClick={() => refetchMeetings()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <Link to="/team" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <Link to="/meeting-upload">
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              Upload Meeting
            </Button>
          </Link>
          <Link to="/team">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </nav>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Meeting Management</h1>
          <p className="text-gray-600">
            View and manage all meetings for {currentTeam?.name || "your team"}
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search meetings, topics, or people..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant={selectedFilter === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleFilterChange("all")}
                >
                  All
                </Button>
                <Button 
                  variant={selectedFilter === "processed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleFilterChange("processed")}
                >
                  Processed
                </Button>
                <Button 
                  variant={selectedFilter === "processing" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleFilterChange("processing")}
                >
                  Processing
                </Button>
                <Button 
                  variant={selectedFilter === "uploaded" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleFilterChange("uploaded")}
                >
                  Uploaded
                </Button>
                <Button 
                  variant={selectedFilter === "failed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleFilterChange("failed")}
                >
                  Failed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{getStatusCount('processed')}</div>
              <p className="text-sm text-gray-600">Processed</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-blue-600">{getStatusCount('processing')}</div>
              <p className="text-sm text-gray-600">Processing</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-600">{getStatusCount('uploaded')}</div>
              <p className="text-sm text-gray-600">Uploaded</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-red-600">{getStatusCount('failed')}</div>
              <p className="text-sm text-gray-600">Failed</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-gray-600">{meetings.length}</div>
              <p className="text-sm text-gray-600">Total</p>
            </CardContent>
          </Card>
        </div>

        {/* Results Header */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredMeetings.length} of {meetings.length} meetings
          </p>
          {isLoadingMeetings && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading meetings...</span>
            </div>
          )}
        </div>

        {/* Meetings Grid - YouTube-like Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMeetings.map((meeting) => {
            const keyPoints = getKeyPoints(meeting);
            const actionItemsCount = meeting.actionItems?.length || 0;
            
            return (
              <Card key={meeting.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden">
                <div onClick={() => handleNavigateToMeeting(meeting.id)}>
                  {/* Thumbnail */}
                  <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 aspect-video">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="w-8 h-8 text-blue-600 ml-1" />
                      </div>
                    </div>
                    
                    {/* Duration Badge */}
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                      {formatDuration(meeting.duration || 0)}
                    </div>
                    
                    {/* Status Badge */}
                    <div className="absolute top-2 left-2">
                      {getStatusBadge(meeting.status)}
                    </div>
                    
                    {/* Processing Animation */}
                    {meeting.status === 'processing' && (
                      <div className="absolute inset-0 bg-blue-500/20 animate-pulse"></div>
                    )}
                  </div>

                  {/* Content */}
                  <CardContent className="p-4">
                    {/* Title and Actions */}
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 text-sm leading-tight">
                        {meeting.title}
                      </h3>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 ml-2 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle menu action
                        }}
                      >
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Meta Information */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center text-xs text-gray-600">
                        <Calendar className="w-3 h-3 mr-1" />
                        <span>{formatDate(meeting.date)}</span>
                        <span className="mx-2">•</span>
                        <Users className="w-3 h-3 mr-1" />
                        <span>{meeting.participants?.length || 0}</span>
                      </div>
                      
                      <div className="flex items-center text-xs text-gray-500">
                        <span>by {meeting.uploadedByName}</span>
                      </div>
                    </div>

                    {/* Summary */}
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2 leading-relaxed">
                      {meeting.aiSummary || meeting.summary || meeting.description || "No summary available"}
                    </p>

                    {/* Key Points */}
                    {keyPoints.length > 0 && (
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-1">
                          {keyPoints.slice(0, 2).map((point, index) => (
                            <span key={index} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                              {point}
                            </span>
                          ))}
                          {keyPoints.length > 2 && (
                            <span className="text-xs text-gray-400">+{keyPoints.length - 2} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bottom Row - Features and Actions */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-3">
                        {actionItemsCount > 0 && (
                          <span className="flex items-center text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {actionItemsCount}
                          </span>
                        )}
                        
                        {meeting.transcript && (
                          <span className="flex items-center text-purple-600">
                            <FileText className="w-3 h-3 mr-1" />
                            Transcript
                          </span>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {meeting.recordingUrl && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(meeting.recordingUrl, '_blank');
                            }}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(`${window.location.origin}/meeting-details?id=${meeting.id}`);
                            toast({
                              title: "Link copied",
                              description: "Meeting link has been copied to clipboard"
                            });
                          }}
                        >
                          <Share2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredMeetings.length === 0 && !isLoadingMeetings && (
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-8 pb-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedFilter !== "all" 
                  ? "Try adjusting your search or filter criteria" 
                  : "Upload your first meeting to get started"}
              </p>
              <Link to="/meeting-upload">
                <Button>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Meeting
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MeetingManagement;
