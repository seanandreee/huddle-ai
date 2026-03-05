import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import TeamInviteForm from "@/components/TeamInviteForm";
import { getUserTeams, getTeamById, Team } from "@/lib/db";

const InviteMembers = () => {
  const { currentUser, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);

  useEffect(() => {
    if (!isLoading && !currentUser) {
      navigate("/login");
    }
  }, [currentUser, isLoading, navigate]);

  useEffect(() => {
    const loadTeam = async () => {
      if (!currentUser) return;
      
      try {
        setIsLoadingTeam(true);
        const userTeams = await getUserTeams(currentUser.uid);
        
        if (!userTeams.currentTeam) {
          navigate("/team-setup");
          return;
        }
        
        const currentTeam = await getTeamById(userTeams.currentTeam);
        if (currentTeam) {
          setTeam(currentTeam);
        } else {
          toast({
            variant: "destructive",
            title: "Team not found",
            description: "The team you're trying to access doesn't exist."
          });
          navigate("/team");
        }
      } catch (error) {
        console.error("Error loading team:", error);
        toast({
          variant: "destructive",
          title: "Failed to load team",
          description: "There was an error loading your team information."
        });
      } finally {
        setIsLoadingTeam(false);
      }
    };
    
    loadTeam();
  }, [currentUser, navigate, toast]);

  if (isLoading || isLoadingTeam) {
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
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">HuddleAI</span>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button 
            variant="ghost" 
            className="mb-4 p-2 h-auto" 
            onClick={() => navigate("/team")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
          
          <h1 className="text-3xl font-bold mb-2">Invite Team Members</h1>
          <p className="text-gray-600">
            Invite colleagues to join your team and collaborate
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            {team && (
              <TeamInviteForm 
                teamId={team.id} 
                teamName={team.name} 
              />
            )}
          </div>
          
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Team Information</CardTitle>
                <CardDescription>
                  Current team details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Team Name</h3>
                  <p className="font-medium">{team?.name}</p>
                </div>
                
                {team?.description && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Description</h3>
                    <p>{team.description}</p>
                  </div>
                )}
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Members</h3>
                  <p>{team?.members.length || 0} members</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Pending Invites</h3>
                  <p>{team?.pendingInvites.length || 0} pending invites</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteMembers;
