import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { createTeamInvite } from "@/lib/db";
import { UserPlus } from "lucide-react";

interface TeamInviteFormProps {
  teamId: string;
  teamName: string;
  onInviteSent?: () => void;
}

const TeamInviteForm = ({ teamId, teamName, onInviteSent }: TeamInviteFormProps) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { currentUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        variant: "destructive",
        title: "Invalid email",
        description: "Please enter a valid email address."
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await createTeamInvite(
        teamId,
        teamName,
        currentUser?.uid as string,
        currentUser?.displayName || "Team member",
        email
      );
      
      toast({
        title: "Invite sent",
        description: `Invitation sent to ${email}`
      });
      
      setEmail("");
      
      if (onInviteSent) {
        onInviteSent();
      }
    } catch (error) {
      console.error("Error sending invite:", error);
      toast({
        variant: "destructive",
        title: "Failed to send invite",
        description: "There was an error sending the invitation."
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <UserPlus className="w-5 h-5 mr-2" />
          Invite Team Member
        </CardTitle>
        <CardDescription>
          Send an invitation to collaborate in your team
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button 
            type="submit" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send Invite"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default TeamInviteForm; 