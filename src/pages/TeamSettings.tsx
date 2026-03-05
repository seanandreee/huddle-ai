import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, ArrowLeft, Settings, Trash2, Search, MoreVertical, Crown, Shield, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SlackIntegration } from "@/components/SlackIntegration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  TeamMember,
  updateUserRole,
  removeTeamMember,
  transferTeamOwnership,
  updateTeam
} from "@/lib/db";

const TeamSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  
  // Team state
  const [isLoading, setIsLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamData, setTeamData] = useState({
    name: "",
    description: "",
  });
  const [slackIntegration, setSlackIntegration] = useState<any>(null);
  
  // Member management state
  const [searchTerm, setSearchTerm] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  
  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
        
        setTeamData({
          name: team.name,
          description: team.description || "",
        });
        
        setSlackIntegration(team.slackIntegration || null);
        
        setIsOwner(team.ownerId === currentUser.uid);
        
        // Load team members
        const members = await getTeamMembers(team.id);
        setTeamMembers(members);
        
        // Find current user's role
        const currentUserMember = members.find(m => m.uid === currentUser.uid);
        setUserRole(currentUserMember?.role || null);
        
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

  const handleSaveTeam = async () => {
    if (!teamId) return;
    
    try {
      await updateTeam(teamId, {
        name: teamData.name,
        description: teamData.description,
      });
      
      toast({
        title: "Team updated",
        description: "Team settings have been updated successfully."
      });
    } catch (error) {
      console.error("Error updating team:", error);
      toast({
        variant: "destructive",
        title: "Failed to update team",
        description: "There was a problem updating the team settings."
      });
    }
  };

  const handleSlackIntegrationChange = async () => {
    // Reload team data to get updated Slack integration
    if (!teamId) return;
    
    try {
      const team = await getTeamById(teamId);
      if (team) {
        setSlackIntegration(team.slackIntegration || null);
      }
    } catch (error) {
      console.error("Error reloading team data:", error);
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: 'admin' | 'moderator' | 'member') => {
    if (!teamId) return;
    
    try {
      await updateUserRole(member.uid, teamId, newRole);
      
      // Update local state
      setTeamMembers(prev =>
        prev.map(m =>
          m.uid === member.uid ? { ...m, role: newRole } : m
        )
      );
      
      toast({
        title: "Role updated",
        description: `${member.displayName}'s role has been updated to ${newRole}.`
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

  const filteredMembers = teamMembers.filter(member =>
    member.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Team Settings</h1>
              <p className="text-gray-600">Manage your team configuration and members</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Team Settings */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Team Settings</CardTitle>
              <CardDescription>Basic information about your team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name</Label>
                <Input
                  id="teamName"
                  value={teamData.name}
                  onChange={(e) => setTeamData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={teamData.description}
                  onChange={(e) => setTeamData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button onClick={handleSaveTeam}>Save Changes</Button>
            </CardContent>
          </Card>

          {/* Slack Integration */}
          {teamId && (
            <SlackIntegration
              teamId={teamId}
              currentIntegration={slackIntegration}
              onIntegrationChange={handleSlackIntegrationChange}
            />
          )}

          {/* Member Management */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage team members and their roles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {filteredMembers.map((member) => (
                  <div key={member.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarImage src={member.photoURL || ''} />
                        <AvatarFallback>
                          {member.displayName
                            ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
                            : member.email.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.displayName}</p>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {member.role === 'admin' ? (
                          <Crown className="w-3 h-3 mr-1" />
                        ) : member.role === 'moderator' ? (
                          <Shield className="w-3 h-3 mr-1" />
                        ) : (
                          <User className="w-3 h-3 mr-1" />
                        )}
                        {member.role}
                      </Badge>
                    </div>
                    
                    {isOwner && member.uid !== currentUser?.uid && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMember(member);
                              setNewRoleValue(member.role);
                            }}
                          >
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMember(member);
                              setConfirmationAction('transfer');
                              setConfirmationDialogOpen(true);
                            }}
                          >
                            Transfer Ownership
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setSelectedMember(member);
                              setConfirmationAction('remove');
                              setConfirmationDialogOpen(true);
                            }}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Role Change Dialog */}
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

export default TeamSettings;
