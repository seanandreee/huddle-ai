import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { createTeamInvite } from "@/lib/db";
import { UserPlus, Copy, Check } from "lucide-react";

interface TeamInviteFormProps {
  teamId: string;
  teamName: string;
  onInviteSent?: () => void;
}

const TeamInviteForm = ({ teamId, teamName, onInviteSent }: TeamInviteFormProps) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
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
      const inviteId = await createTeamInvite(
        teamId,
        teamName,
        currentUser?.uid as string,
        currentUser?.displayName || "Team member",
        email
      );
      
      const link = `${window.location.origin}/signup?invite=${inviteId}`;
      setGeneratedLink(link);

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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Link copied",
      description: "Invite link copied to clipboard."
    });
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

          {generatedLink && (
            <div className="mt-4 space-y-2">
              <Label>Invite Link</Label>
              <div className="flex gap-2">
                <Input readOnly value={generatedLink} className="bg-gray-50 flex-1" />
                <Button type="button" variant="outline" size="icon" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Copy this link and share it directly with your teammate.</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button 
            type="submit" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Create Invite"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default TeamInviteForm; 