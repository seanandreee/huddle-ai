import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Users, UserPlus, ArrowRight, User, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  createTeam, 
  getInvitesByEmail, 
  acceptTeamInvite, 
  declineTeamInvite, 
  TeamInvite 
} from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TeamSetup = () => {
  const { currentUser, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'options' | 'create-team' | 'join-team'>('options');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Team creation state
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  
  // Team invites state
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);

  useEffect(() => {
    if (!isLoading && !currentUser) {
      navigate("/login");
    }
  }, [currentUser, isLoading, navigate]);

  useEffect(() => {
    const loadInvites = async () => {
      if (currentUser?.email) {
        setIsLoadingInvites(true);
        try {
          const userInvites = await getInvitesByEmail(currentUser.email);
          setInvites(userInvites);
        } catch (error) {
          console.error("Error loading invites:", error);
          toast({
            variant: "destructive",
            title: "Failed to load invites",
            description: "There was an error loading your team invites."
          });
        } finally {
          setIsLoadingInvites(false);
        }
      }
    };

    if (step === 'join-team') {
      loadInvites();
    }
  }, [currentUser, step, toast]);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      toast({
        variant: "destructive",
        title: "Team name required",
        description: "Please enter a name for your team."
      });
      return;
    }

    setIsProcessing(true);
    try {
      const team = {
        name: teamName,
        description: teamDescription,
        ownerId: currentUser?.uid as string,
        members: [currentUser?.uid as string],
        pendingInvites: []
      };

      await createTeam(team);
      
      toast({
        title: "Team created successfully",
        description: "Your team has been created."
      });
      
      navigate("/team");
    } catch (error) {
      console.error("Error creating team:", error);
      toast({
        variant: "destructive",
        title: "Failed to create team",
        description: "There was an error creating your team."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setIsProcessing(true);
    try {
      await acceptTeamInvite(inviteId, currentUser?.uid as string);
      
      toast({
        title: "Invite accepted",
        description: "You've successfully joined the team."
      });
      
      navigate("/team");
    } catch (error) {
      console.error("Error accepting invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to accept invite",
        description: "There was an error accepting the team invite."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    setIsProcessing(true);
    try {
      await declineTeamInvite(inviteId);
      
      // Remove the declined invite from the list
      setInvites(prevInvites => prevInvites.filter(invite => invite.id !== inviteId));
      
      toast({
        title: "Invite declined",
        description: "You've declined the team invite."
      });
    } catch (error) {
      console.error("Error declining invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to decline invite",
        description: "There was an error declining the team invite."
      });
    } finally {
      setIsProcessing(false);
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
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <div className="flex items-center space-x-4">
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

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {step === 'options' && (
            <Card className="border-0 shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome to HuddleAI!</CardTitle>
                <CardDescription>
                  To get started, either create a new team or join an existing one
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                <Card 
                  className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 hover:border-blue-400 cursor-pointer transition-colors"
                  onClick={() => setStep('create-team')}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center text-blue-700">
                      <Users className="w-5 h-5 mr-2" /> Create a Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-blue-700/80">
                      Start your own team and invite your colleagues to collaborate
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">
                      Create Team <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardFooter>
                </Card>

                <Card 
                  className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 hover:border-purple-400 cursor-pointer transition-colors"
                  onClick={() => setStep('join-team')}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center text-purple-700">
                      <UserPlus className="w-5 h-5 mr-2" /> Join a Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-purple-700/80">
                      Accept an invite and join an existing team
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full bg-purple-600 hover:bg-purple-700">
                      View Invites <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardFooter>
                </Card>
              </CardContent>
            </Card>
          )}

          {step === 'create-team' && (
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <Button 
                  variant="ghost" 
                  className="w-fit p-2 h-auto mb-4" 
                  onClick={() => setStep('options')}
                >
                  ← Back
                </Button>
                <CardTitle className="text-2xl">Create a New Team</CardTitle>
                <CardDescription>
                  Set up your team workspace to start collaborating
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Team Name</Label>
                  <Input
                    id="teamName"
                    placeholder="e.g., Engineering Team"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    disabled={isProcessing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teamDescription">Description (Optional)</Label>
                  <Textarea
                    id="teamDescription"
                    placeholder="Brief description of your team"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    disabled={isProcessing}
                    rows={4}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('options')}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateTeam}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-blue-600 to-purple-600"
                >
                  {isProcessing ? "Creating..." : "Create Team"}
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 'join-team' && (
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <Button 
                  variant="ghost" 
                  className="w-fit p-2 h-auto mb-4" 
                  onClick={() => setStep('options')}
                >
                  ← Back
                </Button>
                <CardTitle className="text-2xl">Join a Team</CardTitle>
                <CardDescription>
                  View and respond to team invites
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingInvites ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : invites.length > 0 ? (
                  <div className="space-y-4">
                    {invites.map((invite) => (
                      <Card key={invite.id} className="border border-gray-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">{invite.teamName}</CardTitle>
                          <CardDescription>
                            Invited by {invite.invitedByName}
                          </CardDescription>
                        </CardHeader>
                        <CardFooter className="flex justify-end space-x-2 pt-2">
                          <Button 
                            variant="outline" 
                            onClick={() => handleDeclineInvite(invite.id)}
                            disabled={isProcessing}
                          >
                            Decline
                          </Button>
                          <Button 
                            onClick={() => handleAcceptInvite(invite.id)}
                            disabled={isProcessing}
                            className="bg-gradient-to-r from-blue-600 to-purple-600"
                          >
                            Accept
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <h3 className="text-lg font-medium mb-1">No invites found</h3>
                    <p className="text-gray-500 mb-4">
                      You don't have any pending team invites
                    </p>
                    <Button 
                      variant="outline"
                      onClick={() => setStep('create-team')}
                      className="mx-auto"
                    >
                      Create a Team Instead
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamSetup; 