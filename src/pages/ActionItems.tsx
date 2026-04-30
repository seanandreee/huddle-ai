import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MessageSquare, ArrowLeft, Search, FileText,
  User, Calendar as CalendarIcon, Loader2, AlertCircle,
  ExternalLink, Copy, Check
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActionItems, ExtendedActionItem } from "@/hooks/useActionItems";
import { getUserTeams, getTeamById, Team as TeamType } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { getFunctions, httpsCallable } from "firebase/functions";

const ActionItems = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTeam, setCurrentTeam] = useState<TeamType | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [sendingToJira, setSendingToJira] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toast } = useToast();

  // Load current team (optional — solo users also see their action items)
  useEffect(() => {
    const loadCurrentTeam = async () => {
      if (!currentUser) {
        navigate("/login");
        return;
      }

      try {
        setIsLoadingTeam(true);
        const userTeams = await getUserTeams(currentUser.uid);
        if (userTeams.currentTeam) {
          const team = await getTeamById(userTeams.currentTeam);
          if (team) setCurrentTeam(team);
        }
      } catch (error) {
        console.error("Error loading team:", error);
      } finally {
        setIsLoadingTeam(false);
      }
    };

    loadCurrentTeam();
  }, [currentUser, navigate]);

  const {
    actionItems,
    isLoading: isLoadingActionItems,
    error: actionItemsError,
    refetch,
  } = useActionItems({
    teamId: currentTeam?.id || "",
    userId: currentUser?.uid,
    autoRefresh: false,
  });

  const filteredActionItems = actionItems.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      item.description.toLowerCase().includes(q) ||
      (item.assignedToName && item.assignedToName.toLowerCase().includes(q)) ||
      (item.meetingTitle && item.meetingTitle.toLowerCase().includes(q))
    );
  });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const handleSendToJira = async (item: ExtendedActionItem) => {
    const key = `${item.id}-${item.meetingId}`;
    if (!item.teamId) {
      toast({ title: "No team", description: "Action item has no team — cannot send to Jira.", variant: "destructive" });
      return;
    }
    try {
      setSendingToJira((prev) => ({ ...prev, [key]: true }));
      const fns = getFunctions();
      const createIssue = httpsCallable<
        { teamId: string; description: string; assigneeName?: string; meetingTitle?: string; meetingDate?: string },
        { issueKey: string; issueUrl: string }
      >(fns, "createJiraIssue");

      const result = await createIssue({
        teamId: item.teamId,
        description: item.description,
        assigneeName: item.assignedToName,
        meetingTitle: item.meetingTitle,
        meetingDate: item.createdAt
          ? new Date(
              typeof item.createdAt === "object" && "toDate" in item.createdAt
                ? (item.createdAt as { toDate: () => Date }).toDate()
                : item.createdAt
            ).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
          : undefined,
      });

      toast({
        title: `Created ${result.data.issueKey}`,
        description: (
          <a href={result.data.issueUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
            View {result.data.issueKey} in Jira →
          </a>
        ),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create Jira issue.";
      toast({
        title: msg.includes("field mapping") ? "Jira not configured" : "Jira error",
        description: msg.includes("field mapping")
          ? "Go to Integrations → Jira to set up your project mapping."
          : msg,
        variant: "destructive",
      });
    } finally {
      setSendingToJira((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSendToLinear = () => {
    toast({
      title: "Linear Integration — Coming Soon",
      description: "One-click Linear issue creation is available on the Team plan.",
    });
  };

  const handleCopyAll = () => {
    const text = filteredActionItems
      .map((item, i) => `${i + 1}. ${item.description}${item.assignedToName ? ` — ${item.assignedToName}` : ""}${item.dueDate ? ` (Due ${formatDate(item.dueDate)})` : ""}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
      toast({ title: "Copied!", description: "All action items copied to clipboard." });
    });
  };

  if (isLoadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="flex items-center space-x-3 text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (actionItemsError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 mb-4">{actionItemsError}</p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <Link to="/team" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">HuddleAI</span>
        </Link>
        <Link to="/team">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
        </Link>
      </nav>

      <div className="px-6 py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Meeting outputs from {currentTeam?.name || "your meetings"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAll}
              disabled={filteredActionItems.length === 0}
            >
              {copiedAll ? (
                <><Check className="w-4 h-4 mr-2 text-green-600" />Copied!</>
              ) : (
                <><Copy className="w-4 h-4 mr-2" />Copy All</>
              )}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search action items, assignees, or meetings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white border-gray-200"
          />
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 mb-4">
          {isLoadingActionItems ? "Loading..." : `${filteredActionItems.length} action item${filteredActionItems.length !== 1 ? "s" : ""}`}
        </p>

        {/* Items */}
        {isLoadingActionItems ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading action items...</span>
          </div>
        ) : filteredActionItems.length > 0 ? (
          <div className="space-y-3">
            {filteredActionItems.map((item) => (
              <Card key={`${item.id}-${item.meetingId}`} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Bullet */}
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-medium leading-snug mb-2">
                        {item.description}
                      </p>

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                        {item.meetingTitle && (
                          <Link
                            to={`/meeting-details?id=${item.meetingId}`}
                            className="flex items-center hover:text-blue-600 transition-colors"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            {item.meetingTitle}
                          </Link>
                        )}
                        {item.assignedToName && (
                          <span className="flex items-center">
                            <User className="w-3 h-3 mr-1" />
                            {item.assignedToName}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="flex items-center">
                            <CalendarIcon className="w-3 h-3 mr-1" />
                            Due {formatDate(item.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Export CTAs */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2.5 border-gray-200 hover:border-blue-300 hover:text-blue-700"
                        onClick={() => handleSendToJira(item)}
                        disabled={sendingToJira[`${item.id}-${item.meetingId}`]}
                      >
                        {sendingToJira[`${item.id}-${item.meetingId}`]
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><ExternalLink className="w-3 h-3 mr-1" />Jira</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2.5 border-gray-200 hover:border-purple-300 hover:text-purple-700"
                        onClick={handleSendToLinear}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Linear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <h3 className="text-gray-500 font-medium mb-1">
              {actionItems.length === 0 ? "No action items yet" : "No matching results"}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              {actionItems.length === 0
                ? "Upload a meeting recording and HuddleAI will extract action items automatically."
                : "Try a different search term."}
            </p>
            {actionItems.length === 0 && (
              <Link to="/meeting-upload">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Upload Meeting
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionItems;