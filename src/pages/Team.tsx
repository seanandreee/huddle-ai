import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Plus, Upload, Calendar, Clock, Users, MessageSquare, FileText, 
  Settings, UserPlus, BarChart3, User, LogOut, CheckCircle2, Slack, AlertCircle
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { 
  getUserTeams, 
  getTeamById, 
  Team as TeamType, 
  getUsersByIds, 
  UserProfile,
  getRecentMeetingsForTeam,
  Meeting,
  getTeamMeetingStats,
  ensureUserProfileExists
} from "@/lib/db";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const Team = () => {
  const { currentUser, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [team, setTeam] = useState<TeamType | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);
  const [meetingStats, setMeetingStats] = useState<{
    totalMeetings: number;
    totalDuration: number;
    processedMeetings: number;
    totalActionItems: number;
    completedActionItems: number;
    averageDuration: number;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<any>(null);
  const [slackIntegration, setSlackIntegration] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) return;
      await checkTeamMembership();
    };
    
    loadData();
  }, [currentUser]);

  const checkTeamMembership = async () => {
    if (!currentUser) return;
    
    try {
      setIsLoadingTeam(true);
      console.log("Checking team membership for user:", currentUser.uid);
      
      // Ensure current user has a profile
      if (currentUser.displayName && currentUser.email) {
        await ensureUserProfileExists(
          currentUser.uid,
          currentUser.displayName,
          currentUser.email,
          currentUser.photoURL || undefined
        );
      }
      
      const userTeams = await getUserTeams(currentUser.uid);
      
      if (!userTeams.currentTeam) {
        // User doesn't have a team, redirect to team setup
        console.log("No current team found, redirecting to setup");
        navigate("/team-setup");
        return;
      }
      
      console.log("Loading team:", userTeams.currentTeam);
      // Load current team data
      const currentTeam = await getTeamById(userTeams.currentTeam);
      if (currentTeam) {
        console.log("Team loaded:", currentTeam.name, "with members:", currentTeam.members);
        setTeam(currentTeam);
        
        // Load team members
        await loadTeamMembers(currentTeam.members);
        
        // Load recent meetings
        await loadRecentMeetings(currentTeam.id);
        
        // Load meeting stats
        await loadMeetingStats(currentTeam.id);

        // Fetch team data
        if (currentTeam) {
          try {
            const teamRef = doc(db, "teams", currentTeam.id);
            const teamDoc = await getDoc(teamRef);
            
            if (teamDoc.exists()) {
              const teamInfo = teamDoc.data();
              setTeamData(teamInfo);
              setSlackIntegration(teamInfo.slackIntegration || null);
            }
          } catch (error) {
            console.error("Error fetching team data:", error);
          }
        }
      } else {
        // Team not found
        console.log("Team not found");
        toast({
          variant: "destructive",
          title: "Team not found",
          description: "We couldn't find your team. Please create or join a team."
        });
        navigate("/team-setup");
      }
    } catch (error) {
      console.error("Error checking team membership:", error);
      toast({
        variant: "destructive",
        title: "Error loading team",
        description: "There was a problem accessing your team information."
      });
    } finally {
      setIsLoadingTeam(false);
    }
  };
  
  const loadTeamMembers = async (memberIds: string[]) => {
    if (!memberIds || memberIds.length === 0) {
      console.log("No members to load");
      setTeamMembers([]);
      setIsLoadingMembers(false);
      return;
    }
    
    try {
      setIsLoadingMembers(true);
      console.log("Loading team members:", memberIds);
      const members = await getUsersByIds(memberIds);
      console.log("Team members loaded:", members);
      setTeamMembers(members);
    } catch (error) {
      console.error("Error loading team members:", error);
      toast({
        variant: "destructive",
        title: "Error loading members",
        description: "There was a problem loading team members."
      });
    } finally {
      setIsLoadingMembers(false);
    }
  };
  
  const loadRecentMeetings = async (teamId: string) => {
    try {
      setIsLoadingMeetings(true);
      const meetings = await getRecentMeetingsForTeam(teamId, 3);
      setRecentMeetings(meetings);
    } catch (error) {
      console.error("Error loading recent meetings:", error);
      toast({
        variant: "destructive",
        title: "Error loading meetings",
        description: "There was a problem loading your recent meetings."
      });
    } finally {
      setIsLoadingMeetings(false);
    }
  };
  
  const loadMeetingStats = async (teamId: string) => {
    try {
      setIsLoadingStats(true);
      const stats = await getTeamMeetingStats(teamId);
      setMeetingStats(stats);
      console.log("Meeting stats loaded:", stats);
    } catch (error) {
      console.error("Error loading meeting stats:", error);
      toast({
        variant: "destructive",
        title: "Error loading stats",
        description: "There was a problem loading your meeting statistics."
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const refreshTeamData = async () => {
    if (!team) return;
    
    try {
      const refreshedTeam = await getTeamById(team.id);
      if (refreshedTeam) {
        setTeam(refreshedTeam);
        await loadTeamMembers(refreshedTeam.members);
        await loadRecentMeetings(refreshedTeam.id);
        await loadMeetingStats(refreshedTeam.id);
        
        // Refresh Slack integration data
        try {
          const teamRef = doc(db, "teams", refreshedTeam.id);
          const teamDoc = await getDoc(teamRef);
          
          if (teamDoc.exists()) {
            const teamInfo = teamDoc.data();
            setTeamData(teamInfo);
            setSlackIntegration(teamInfo.slackIntegration || null);
          }
        } catch (error) {
          console.error("Error fetching updated team data:", error);
        }
      }
    } catch (error) {
      console.error("Error refreshing team data:", error);
      toast({
        variant: "destructive",
        title: "Error refreshing team",
        description: "There was a problem refreshing your team data."
      });
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "There was a problem logging out",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "online": return "bg-green-500";
      case "away": return "bg-yellow-500";
      case "offline": return "bg-gray-400";
      default: return "bg-gray-400";
    }
  };

  const getMeetingStatusBadge = (status: string) => {
    switch (status) {
      case "processed": return <Badge className="bg-green-100 text-green-800">Processed</Badge>;
      case "processing": return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">Uploaded</Badge>;
    }
  };
  
  const formatDuration = (durationInSeconds?: number) => {
    if (!durationInSeconds || durationInSeconds === 0) return "0 mins";
    
    const minutes = Math.floor(durationInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
    } else {
      return `${minutes}m`;
    }
  };
  
  const formatDate = (timestamp?: any) => {
    if (!timestamp) return "";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const formatTotalDuration = (durationInSeconds: number) => {
    if (!durationInSeconds) return "0 mins";
    
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  if (isLoadingTeam) {
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
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <Link to="/invite-members">
            <Button variant="outline">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          </Link>
          <Link to="/meeting-upload">
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              Upload Meeting
            </Button>
          </Link>
          
          {/* User account dropdown with logout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full size-10 p-0">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={currentUser?.photoURL || ''} alt={currentUser?.displayName || 'User'} />
                  <AvatarFallback>
                    {currentUser?.displayName 
                      ? currentUser.displayName.split(' ').map(n => n[0]).join('').toUpperCase() 
                      : currentUser?.email?.substring(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-0.5 leading-none">
                  <p className="font-medium text-sm">{currentUser?.displayName || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <Link to="/profile">
                <DropdownMenuItem>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
              </Link>
              <Link to="/team-settings">
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600" 
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                <LogOut className="w-4 h-4 mr-2" />
                {isLoggingOut ? "Logging out..." : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {team ? team.name : "Team Dashboard"}
            </h1>
            <p className="text-gray-600">
              {team?.description || "Manage your team and track meeting insights"}
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={refreshTeamData} className="mr-2">
              <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </Button>
            <Link to="/action-items">
              <Button variant="outline">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Action Items
              </Button>
            </Link>
            <Link to="/team-settings">
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
            <Link to="/integrations">
              <Button variant="outline">
                <BarChart3 className="w-4 h-4 mr-2" />
                Integrations
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-16 rounded"></div>
              ) : (
                <div className="text-2xl font-bold">{meetingStats?.totalMeetings || 0}</div>
              )}
              <p className="text-xs text-muted-foreground">
                {isLoadingStats ? "Loading..." : "All time"}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-20 rounded"></div>
              ) : (
                <div className="text-2xl font-bold">
                  {formatTotalDuration(meetingStats?.totalDuration || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {isLoadingStats ? "Loading..." : `Avg: ${formatDuration(meetingStats?.averageDuration || 0)}`}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold">{meetingStats?.processedMeetings || 0}</div>
              )}
              <p className="text-xs text-muted-foreground">
                {isLoadingStats ? "Loading..." : 
                  meetingStats?.totalMeetings ? 
                    `${Math.round((meetingStats.processedMeetings / meetingStats.totalMeetings) * 100)}% success rate` :
                    "No meetings yet"
                }
              </p>
            </CardContent>
          </Card>
          
          <Link to="/action-items">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Action Items</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
                ) : (
                  <div className="text-2xl font-bold">{meetingStats?.totalActionItems || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  {isLoadingStats ? "Loading..." : 
                    meetingStats?.totalActionItems ? 
                      `${meetingStats.completedActionItems} completed` :
                      "No action items"
                  }
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Slack Integration Status */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-lg">
                  <Slack className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Slack Integration</h3>
                  <p className="text-xs text-gray-500">
                    {slackIntegration?.isActive ? (
                      <>Connected to #{slackIntegration.channelName}</>
                    ) : (
                      "Connect your team's Slack workspace for automated notifications"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {slackIntegration?.isActive ? (
                  <>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                    <Link to="/team-settings">
                      <Button size="sm" variant="outline">
                        Manage
                      </Button>
                    </Link>
                  </>
                ) : (
                  <Link to="/team-settings">
                    <Button size="sm">
                      Setup Integration
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Team Members */}
          <div className="lg:col-span-1">
            <Card className="border-0 shadow-lg h-fit">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Team Members
                  <Link to="/member-management">
                    <Button size="sm" variant="outline">
                      Manage
                    </Button>
                  </Link>
                </CardTitle>
                <CardDescription>Manage your team and their roles</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingMembers ? (
                  // Loading skeleton
                  Array(3).fill(0).map((_, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 animate-pulse">
                      <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))
                ) : teamMembers.length > 0 ? (
                  teamMembers.map((member, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={member.photoURL || ''} />
                          <AvatarFallback>
                            {member.displayName 
                              ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase() 
                              : member.email?.substring(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(member.status)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.displayName}</p>
                        <p className="text-xs text-gray-500 truncate">{member.role || member.email}</p>
                      </div>
                    </div>
                  ))
                ) : team && team.members && team.members.length > 0 ? (
                  <div className="text-center py-6">
                    <Users className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                    <h3 className="text-sm font-medium text-gray-900">Loading members...</h3>
                    <p className="text-xs text-gray-500 mb-4">Please wait while we load the team members</p>
                    <Button size="sm" variant="outline" onClick={() => loadTeamMembers(team.members)}>
                      <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retry Loading
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Users className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                    <h3 className="text-sm font-medium text-gray-900">No team members yet</h3>
                    <p className="text-xs text-gray-500 mb-4">Start by inviting colleagues to your team</p>
                    <Link to="/invite-members">
                      <Button size="sm" variant="outline">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite Team Members
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Meetings */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Recent Meetings
                  <div className="flex space-x-2">
                    <Link to="/meeting-management">
                      <Button size="sm" variant="outline">
                        View All
                      </Button>
                    </Link>
                    <Link to="/meeting-upload">
                      <Button size="sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload New
                      </Button>
                    </Link>
                  </div>
                </CardTitle>
                <CardDescription>Your team's latest standup recordings and insights</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingMeetings ? (
                  // Loading skeleton
                  Array(2).fill(0).map((_, index) => (
                    <div key={index} className="p-4 rounded-lg border animate-pulse">
                      <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
                      <div className="flex space-x-4 mb-3">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-4 bg-gray-200 rounded w-20"></div>
                        <div className="h-4 bg-gray-200 rounded w-28"></div>
                      </div>
                      <div className="h-4 bg-gray-200 rounded w-full mb-3"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  ))
                ) : recentMeetings.length > 0 ? (
                  recentMeetings.map((meeting) => (
                    <Link key={meeting.id} to={`/meeting-details?id=${meeting.id}`} className="block">
                      <div className="p-4 rounded-lg border hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{meeting.title}</h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                              <span className="flex items-center">
                                <Calendar className="w-4 h-4 mr-1" />
                                {formatDate(meeting.date)}
                              </span>
                              <span className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                {formatDuration(meeting.duration)}
                              </span>
                              <span className="flex items-center">
                                <Users className="w-4 h-4 mr-1" />
                                {meeting.participants?.length || 0} participants
                              </span>
                            </div>
                          </div>
                          {getMeetingStatusBadge(meeting.status)}
                        </div>
                        
                        {/* AI Summary or regular summary */}
                        {(meeting.aiSummary || meeting.summary) && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {meeting.aiSummary || meeting.summary}
                          </p>
                        )}
                        
                        {/* Meeting insights footer */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center space-x-4">
                            {/* Action Items Count */}
                            {((meeting.aiActionItems && meeting.aiActionItems.length > 0) || (meeting.actionItems && meeting.actionItems.length > 0)) && (
                              <span className="flex items-center">
                                <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                                {(meeting.aiActionItems?.length || meeting.actionItems?.length || 0)} action items
                              </span>
                            )}
                            
                            {/* Topics Discussed Count */}
                            {meeting.topicsDiscussed && meeting.topicsDiscussed.length > 0 && (
                              <span className="flex items-center">
                                <MessageSquare className="w-3 h-3 mr-1 text-blue-500" />
                                {meeting.topicsDiscussed.length} topics
                              </span>
                            )}
                            
                            {/* Transcript Available */}
                            {meeting.transcript && (
                              <span className="flex items-center">
                                <FileText className="w-3 h-3 mr-1 text-purple-500" />
                                Transcript
                              </span>
                            )}
                          </div>
                          
                          <span className="text-gray-400">
                            by {meeting.uploadedByName}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-6">
                    <Calendar className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                    <h3 className="text-sm font-medium text-gray-900">No meetings yet</h3>
                    <p className="text-xs text-gray-500 mb-4">Get started by uploading your first meeting recording</p>
                    <Link to="/meeting-upload">
                      <Button size="sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Meeting
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Team;
