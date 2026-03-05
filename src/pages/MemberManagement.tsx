import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { 
  MessageSquare, 
  ArrowLeft, 
  Search, 
  UserPlus, 
  MoreVertical, 
  Crown, 
  Shield, 
  User,
  AlertCircle,
  Trash,
  UserCog
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  getUserTeams, 
  getTeamById, 
  getTeamMembers, 
  getPendingTeamInvites, 
  TeamMember, 
  TeamInvite,
  updateUserRole,
  removeTeamMember,
  transferTeamOwnership
} from "@/lib/db";

const MemberManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  
  // Dialog states
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<'remove' | 'transfer' | null>(null);
  const [newRoleValue, setNewRoleValue] = useState<string>("");
  
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
        
        setTeamId(userTeams.currentTeam);
        
        // Load team info
        const team = await getTeamById(userTeams.currentTeam);
        
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
        setIsOwner(team.ownerId === currentUser.uid);
        
        // Load team members
        const members = await getTeamMembers(team.id);
        setTeamMembers(members);
        
        // Find current user's role
        const currentUserMember = members.find(m => m.uid === currentUser.uid);
        setUserRole(currentUserMember?.role || null);
        
        // Load pending invites
        const invites = await getPendingTeamInvites(team.id);
        setPendingInvites(invites);
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
  
  const filteredMembers = teamMembers.filter(member =>
    member.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const getMemberStatus = (member: TeamMember) => {
    return member.status === 'inactive' ? 'Inactive' : 
           member.status === 'online' ? 'Active' : 
           member.status === 'away' ? 'Away' : 'Offline';
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Crown className="w-4 h-4" />;
      case "moderator": return <Shield className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };
  
  const getRoleDisplay = (role: string) => {
    switch (role) {
      case "admin": return "Admin";
      case "moderator": return "Moderator";
      default: return "Member";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": 
      case "Active": return "bg-green-100 text-green-800";
      case "away":
      case "Away": return "bg-yellow-100 text-yellow-800";
      case "offline":
      case "Offline": return "bg-gray-100 text-gray-800";
      case "inactive":
      case "Inactive": return "bg-red-100 text-red-800";
      case "pending":
      case "Pending": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };
  
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };
  
  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return "Never";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / 60000);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    if (diffInHours < 24) return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffInDays < 30) return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    
    return formatDate(timestamp);
  };
  
  const handleChangeRole = async (member: TeamMember, newRole: 'admin' | 'moderator' | 'member') => {
    if (!teamId) return;
    
    try {
      await updateUserRole(member.uid, teamId, newRole);
      
      // Update local state
      setTeamMembers(prev => 
        prev.map(m => m.uid === member.uid ? { ...m, role: newRole } : m)
      );
      
      toast({
        title: "Role updated",
        description: `${member.displayName}'s role has been updated to ${getRoleDisplay(newRole)}.`
      });
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        variant: "destructive",
        title: "Failed to update role",
        description: "There was a problem updating the member's role."
      });
    } finally {
      setSelectedMember(null);
      setNewRoleValue("");
    }
  };
  
  const handleRemoveMember = async () => {
    if (!teamId || !selectedMember) return;
    
    try {
      await removeTeamMember(selectedMember.uid, teamId);
      
      // Update local state
      setTeamMembers(prev => prev.filter(m => m.uid !== selectedMember.uid));
      
      toast({
        title: "Member removed",
        description: `${selectedMember.displayName} has been removed from the team.`
      });
    } catch (error) {
      console.error("Error removing member:", error);
      toast({
        variant: "destructive",
        title: "Failed to remove member",
        description: error instanceof Error ? error.message : "There was a problem removing the team member."
      });
    } finally {
      setSelectedMember(null);
      setConfirmationDialogOpen(false);
      setConfirmationAction(null);
    }
  };
  
  const handleTransferOwnership = async () => {
    if (!teamId || !selectedMember) return;
    
    try {
      await transferTeamOwnership(teamId, selectedMember.uid);
      
      // Update local state
      setTeamMembers(prev => 
        prev.map(m => {
          if (m.uid === selectedMember.uid) return { ...m, role: 'admin' };
          if (m.uid === currentUser?.uid) return { ...m, role: 'moderator' };
          return m;
        })
      );
      
      setIsOwner(false);
      
      toast({
        title: "Ownership transferred",
        description: `${selectedMember.displayName} is now the team owner.`
      });
    } catch (error) {
      console.error("Error transferring ownership:", error);
      toast({
        variant: "destructive",
        title: "Failed to transfer ownership",
        description: "There was a problem transferring team ownership."
      });
    } finally {
      setSelectedMember(null);
      setConfirmationDialogOpen(false);
      setConfirmationAction(null);
    }
  };
  
  const refreshData = async () => {
    if (!teamId) return;
    
    try {
      setIsLoading(true);
      
      // Reload team members
      const members = await getTeamMembers(teamId);
      setTeamMembers(members);
      
      // Reload pending invites
      const invites = await getPendingTeamInvites(teamId);
      setPendingInvites(invites);
      
      toast({
        title: "Data refreshed",
        description: "Member information has been updated."
      });
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast({
        variant: "destructive",
        title: "Failed to refresh data",
        description: "There was a problem updating member information."
      });
    } finally {
      setIsLoading(false);
    }
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
        <div className="flex items-center space-x-4">
          <Link to="/invite-members">
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Members
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

      <div className="px-6 py-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Member Management</h1>
            <p className="text-gray-600">Manage {teamName} team members, roles, and permissions</p>
          </div>
          <Button variant="outline" onClick={refreshData} disabled={isLoading}>
            <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline">Filter</Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{teamMembers.filter(m => m.status !== 'inactive').length}</div>
              <p className="text-sm text-gray-600">Active Members</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{pendingInvites.length}</div>
              <p className="text-sm text-gray-600">Pending Invites</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">{teamMembers.filter(m => m.role === 'admin').length}</div>
              <p className="text-sm text-gray-600">Admins</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-600">{teamMembers.length}</div>
              <p className="text-sm text-gray-600">Total Members</p>
            </CardContent>
          </Card>
        </div>

        {/* Members List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Showing {filteredMembers.length} of {teamMembers.length} members
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredMembers.length > 0 ? (
              <div className="space-y-4">
                {filteredMembers.map((member) => (
                  <div key={member.uid} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage src={member.photoURL || ''} />
                        <AvatarFallback>
                          {member.displayName
                            ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
                            : member.email.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">{member.displayName}</h3>
                          <div className="flex items-center space-x-1">
                            {getRoleIcon(member.role)}
                            <span className="text-sm text-gray-600">{getRoleDisplay(member.role)}</span>
                          </div>
                          {member.uid === currentUser?.uid && (
                            <Badge variant="outline" className="ml-2">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-gray-500">Joined {formatDate(member.joinedDate)}</span>
                          <span className="text-xs text-gray-500">Last active: {formatRelativeTime(member.lastActive)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge className={getStatusColor(member.status)}>
                        {getMemberStatus(member)}
                      </Badge>
                      
                      {/* Actions dropdown - only show if current user is admin/owner, and not for themselves if they're the owner */}
                      {(userRole === 'admin' || isOwner) && !(isOwner && member.uid === currentUser?.uid) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member);
                                setNewRoleValue(member.role);
                              }}
                              className="cursor-pointer"
                            >
                              <UserCog className="mr-2 h-4 w-4" />
                              <span>Change Role</span>
                            </DropdownMenuItem>
                            
                            {isOwner && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedMember(member);
                                  setConfirmationAction('transfer');
                                  setConfirmationDialogOpen(true);
                                }}
                                className="cursor-pointer"
                              >
                                <Crown className="mr-2 h-4 w-4" />
                                <span>Transfer Ownership</span>
                              </DropdownMenuItem>
                            )}
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member);
                                setConfirmationAction('remove');
                                setConfirmationDialogOpen(true);
                              }}
                              className="text-red-600 cursor-pointer"
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              <span>Remove from Team</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No members found</h3>
                <p className="text-gray-500 mt-2">Try a different search term or refresh the page.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Pending Invites section */}
        {pendingInvites.length > 0 && (
          <Card className="border-0 shadow-lg mt-8">
            <CardHeader>
              <CardTitle>Pending Invites</CardTitle>
              <CardDescription>
                People who have been invited but haven't joined yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>
                          {invite.invitedEmail.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium text-gray-900">{invite.invitedEmail}</h3>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-gray-500">Invited by {invite.invitedByName}</span>
                          <span className="text-xs text-gray-500">Sent {formatRelativeTime(invite.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">Pending</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Change Role Dialog */}
      {selectedMember && newRoleValue && (
        <Dialog open={!!selectedMember && !!newRoleValue} onOpenChange={() => setSelectedMember(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Change Role for {selectedMember.displayName}</DialogTitle>
              <DialogDescription>
                Select a new role for this team member.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select 
                value={newRoleValue}
                onValueChange={setNewRoleValue}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-4 text-sm text-gray-500">
                <p className="font-medium mb-2">Role permissions:</p>
                <ul className="space-y-1 list-disc pl-5">
                  <li><span className="font-medium">Admin:</span> Full access to manage team, members, and settings</li>
                  <li><span className="font-medium">Moderator:</span> Can manage meetings and some team settings</li>
                  <li><span className="font-medium">Member:</span> Can view and participate in meetings</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedMember(null)}>
                Cancel
              </Button>
              <Button 
                onClick={() => handleChangeRole(
                  selectedMember, 
                  newRoleValue as 'admin' | 'moderator' | 'member'
                )}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Confirmation Dialog */}
      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {confirmationAction === 'remove' ? 'Remove Team Member' : 'Transfer Ownership'}
            </DialogTitle>
            <DialogDescription>
              {confirmationAction === 'remove' 
                ? 'Are you sure you want to remove this member from the team? This action cannot be undone.'
                : 'Are you sure you want to transfer team ownership to this member? You will no longer be the team owner.'}
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="py-4 flex items-center space-x-4">
              <Avatar>
                <AvatarImage src={selectedMember.photoURL || ''} />
                <AvatarFallback>
                  {selectedMember.displayName
                    ? selectedMember.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
                    : selectedMember.email.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedMember.displayName}</p>
                <p className="text-sm text-gray-500">{selectedMember.email}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setConfirmationDialogOpen(false);
              setSelectedMember(null);
              setConfirmationAction(null);
            }}>
              Cancel
            </Button>
            <Button 
              variant={confirmationAction === 'remove' ? 'destructive' : 'default'}
              onClick={confirmationAction === 'remove' ? handleRemoveMember : handleTransferOwnership}
            >
              {confirmationAction === 'remove' ? 'Remove Member' : 'Transfer Ownership'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MemberManagement;
