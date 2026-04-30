import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, ArrowLeft, Settings, CheckCircle, AlertCircle, Video, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/lib/WorkspaceContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useToast } from "@/components/ui/use-toast";

interface JiraIntegrationData {
  status: string;
  cloudId: string | null;
  cloudName: string | null;
  cloudUrl: string | null;
  projectKey: string | null;
  projectName: string | null;
  issueTypeId: string | null;
  issueTypeName: string | null;
}

interface JiraCloud {
  id: string;
  name: string;
  url: string;
  projects: Array<{ id: string; key: string; name: string }>;
}

const Integrations = () => {
  const { currentUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();

  // Google state
  const [integrations, setIntegrations] = useState({
    google: { enabled: false, configured: false },
    slack: { enabled: true, configured: true },
  });
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const googleConnectedToastShown = useRef(false);

  // Jira state
  const [jiraData, setJiraData] = useState<JiraIntegrationData | null>(null);
  const [isJiraLoading, setIsJiraLoading] = useState(false);
  const [jiraResources, setJiraResources] = useState<JiraCloud[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [selectedCloudId, setSelectedCloudId] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [issueTypes, setIssueTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingIssueTypes, setIsLoadingIssueTypes] = useState(false);
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState("");
  const [selectedIssueTypeName, setSelectedIssueTypeName] = useState("");
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const jiraConnectedToastShown = useRef(false);

  // Google Firestore listener
  useEffect(() => {
    if (!currentUser) return;
    const integrationRef = doc(db, "users", currentUser.uid, "integrations", "google");
    const unsubscribe = onSnapshot(integrationRef, (snap) => {
      if (snap.exists()) {
        const status = snap.data().status as string;
        const isConnected = status === "connected" || status === "connected_no_refresh";
        setIntegrations(prev => ({ ...prev, google: { enabled: isConnected, configured: isConnected } }));
        if (isConnected && !googleConnectedToastShown.current) {
          googleConnectedToastShown.current = true;
          if (new URLSearchParams(window.location.search).get('google_connected') === 'true') {
            toast({ title: "Connected", description: "Google Workspace successfully connected for auto-ingest." });
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      } else {
        setIntegrations(prev => ({ ...prev, google: { enabled: false, configured: false } }));
      }
    }, (err) => console.error("[Integrations] Google snapshot error:", err));
    return () => unsubscribe();
  }, [currentUser, toast]);

  // Jira Firestore listener
  useEffect(() => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) { setJiraData(null); return; }

    const jiraRef = doc(db, "teams", teamId, "integrations", "jira");
    const unsubscribe = onSnapshot(jiraRef, (snap) => {
      if (snap.exists()) {
        setJiraData(snap.data() as JiraIntegrationData);
        if (!jiraConnectedToastShown.current) {
          jiraConnectedToastShown.current = true;
          if (new URLSearchParams(window.location.search).get("jira_connected") === "true") {
            toast({ title: "Jira connected", description: "Now configure your project mapping below." });
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        setJiraData(null);
        jiraConnectedToastShown.current = false;
      }
    }, (err) => console.error("[Integrations] Jira snapshot error:", err));
    return () => unsubscribe();
  }, [activeWorkspace, toast]);

  // Google handlers
  const handleConnectGoogle = async () => {
    if (integrations.google.configured) {
      try {
        setIsGoogleLoading(true);
        const fns = getFunctions();
        await httpsCallable(fns, 'disconnectGoogleIntegration')();
        setIntegrations(prev => ({ ...prev, google: { enabled: false, configured: false } }));
        toast({ title: "Disconnected", description: "Google Workspace disconnected." });
      } catch {
        toast({ title: "Error", description: "Failed to disconnect", variant: "destructive" });
      } finally {
        setIsGoogleLoading(false);
      }
    } else {
      try {
        setIsGoogleLoading(true);
        const fns = getFunctions();
        const getUrl = httpsCallable<{ workspaceId: string; origin: string }, { url: string }>(fns, 'getGoogleOAuthUrl');
        const response = await getUrl({ workspaceId: activeWorkspace?.id || 'personal', origin: window.location.origin });
        window.location.href = response.data.url;
      } catch {
        toast({ title: "Error", description: "Failed to get Google Auth URL", variant: "destructive" });
        setIsGoogleLoading(false);
      }
    }
  };

  // Jira handlers
  const handleConnectJira = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsJiraLoading(true);
      const fns = getFunctions();
      const getUrl = httpsCallable<{ teamId: string }, { url: string }>(fns, "getJiraOAuthUrl");
      const response = await getUrl({ teamId });
      window.location.href = response.data.url;
    } catch {
      toast({ title: "Error", description: "Failed to start Jira connection.", variant: "destructive" });
      setIsJiraLoading(false);
    }
  };

  const handleDisconnectJira = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsJiraLoading(true);
      const fns = getFunctions();
      await httpsCallable(fns, "disconnectJiraIntegration")({ teamId });
      setJiraData(null);
      setJiraResources([]);
      setShowMappingForm(false);
      toast({ title: "Disconnected", description: "Jira disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Jira.", variant: "destructive" });
    } finally {
      setIsJiraLoading(false);
    }
  };

  const handleLoadResources = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLoadingResources(true);
      const fns = getFunctions();
      const fn = httpsCallable<{ teamId: string }, { clouds: JiraCloud[] }>(fns, "getJiraResources");
      const result = await fn({ teamId });
      setJiraResources(result.data.clouds);
      if (result.data.clouds.length === 1) setSelectedCloudId(result.data.clouds[0].id);
      setShowMappingForm(true);
    } catch {
      toast({ title: "Error", description: "Failed to load Jira projects.", variant: "destructive" });
    } finally {
      setIsLoadingResources(false);
    }
  };

  const handleCloudSelect = (cloudId: string) => {
    setSelectedCloudId(cloudId);
    setSelectedProjectKey("");
    setSelectedProjectName("");
    setSelectedIssueTypeId("");
    setSelectedIssueTypeName("");
    setIssueTypes([]);
  };

  const handleProjectSelect = async (projectKey: string) => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId || !selectedCloudId) return;
    const cloud = jiraResources.find((c) => c.id === selectedCloudId);
    const project = cloud?.projects.find((p) => p.key === projectKey);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(project?.name || projectKey);
    setSelectedIssueTypeId("");
    setSelectedIssueTypeName("");
    setIssueTypes([]);
    try {
      setIsLoadingIssueTypes(true);
      const fns = getFunctions();
      const fn = httpsCallable<
        { teamId: string; cloudId: string; projectKey: string },
        { issueTypes: Array<{ id: string; name: string }> }
      >(fns, "getJiraIssueTypes");
      const result = await fn({ teamId, cloudId: selectedCloudId, projectKey });
      setIssueTypes(result.data.issueTypes);
    } catch {
      toast({ title: "Error", description: "Failed to load issue types.", variant: "destructive" });
    } finally {
      setIsLoadingIssueTypes(false);
    }
  };

  const handleSaveMapping = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId || !selectedCloudId || !selectedProjectKey || !selectedIssueTypeId) {
      toast({ title: "Error", description: "Select a cloud instance, project, and issue type.", variant: "destructive" });
      return;
    }
    const cloud = jiraResources.find((c) => c.id === selectedCloudId);
    try {
      setIsSavingMapping(true);
      const fns = getFunctions();
      await httpsCallable(fns, "saveJiraMapping")({
        teamId,
        cloudId: selectedCloudId,
        cloudName: cloud?.name || selectedCloudId,
        cloudUrl: cloud?.url || "",
        projectKey: selectedProjectKey,
        projectName: selectedProjectName,
        issueTypeId: selectedIssueTypeId,
        issueTypeName: selectedIssueTypeName,
      });
      setShowMappingForm(false);
      toast({ title: "Saved", description: `Jira mapped to ${selectedProjectName} · ${selectedIssueTypeName}.` });
    } catch {
      toast({ title: "Error", description: "Failed to save mapping.", variant: "destructive" });
    } finally {
      setIsSavingMapping(false);
    }
  };

  const toggleSlack = () => {
    setIntegrations(prev => ({
      ...prev,
      slack: { ...prev.slack, enabled: !prev.slack.enabled },
    }));
  };

  const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
  const jiraIsConnected = jiraData?.status === "connected";
  const jiraHasMapping = jiraIsConnected && !!jiraData?.projectKey;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
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

      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
              <p className="text-gray-600">Connect HuddleAI with your favorite tools</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Google Workspace */}
          <Card className="border-0 shadow-lg border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Video className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>Google Workspace</CardTitle>
                    <CardDescription>Auto-ingest Google Meet recordings and transcripts</CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {integrations.google.configured ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                    </Badge>
                  )}
                  <Button
                    variant={integrations.google.configured ? "outline" : "default"}
                    onClick={handleConnectGoogle}
                    disabled={isGoogleLoading}
                    className={!integrations.google.configured ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" : ""}
                  >
                    {isGoogleLoading ? "Processing..." : integrations.google.configured ? "Disconnect" : "Connect Account"}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Slack */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="font-bold text-purple-600">#</span>
                  </div>
                  <div>
                    <CardTitle>Slack</CardTitle>
                    <CardDescription>Send meeting summaries and action items to Slack</CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {integrations.slack.configured ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                    </Badge>
                  )}
                  <Switch checked={integrations.slack.enabled} onCheckedChange={toggleSlack} />
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Jira */}
          {!teamId ? (
            <Card className="border-0 shadow-lg opacity-60">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl font-bold text-blue-600">J</span>
                  </div>
                  <div>
                    <CardTitle>Jira</CardTitle>
                    <CardDescription>Switch to a team workspace to connect Jira</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card className={`border-0 shadow-lg ${jiraIsConnected ? "border-l-4 border-l-green-500" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold text-blue-600">J</span>
                    </div>
                    <div>
                      <CardTitle>Jira</CardTitle>
                      <CardDescription>
                        {jiraHasMapping
                          ? `${jiraData!.projectName || jiraData!.projectKey} · ${jiraData!.issueTypeName}`
                          : "Create Jira issues from action items"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {jiraIsConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                      </Badge>
                    )}
                    {jiraIsConnected ? (
                      <div className="flex items-center gap-2">
                        {jiraHasMapping && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleLoadResources}
                            disabled={isLoadingResources}
                          >
                            {isLoadingResources ? <Loader2 className="w-3 h-3 animate-spin" /> : "Edit Mapping"}
                          </Button>
                        )}
                        <Button variant="outline" onClick={handleDisconnectJira} disabled={isJiraLoading}>
                          {isJiraLoading ? "Processing..." : "Disconnect"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleConnectJira}
                        disabled={isJiraLoading}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        {isJiraLoading ? "Connecting..." : "Connect Jira"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Field mapping — shown when connected but no mapping yet, or when editing */}
              {jiraIsConnected && (!jiraHasMapping || showMappingForm) && (
                <CardContent className="space-y-4 pt-0">
                  <p className="text-sm text-gray-500">
                    {jiraHasMapping ? "Update your project mapping:" : "Select where action items should be sent:"}
                  </p>

                  {!showMappingForm ? (
                    <Button variant="outline" onClick={handleLoadResources} disabled={isLoadingResources}>
                      {isLoadingResources
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading projects...</>
                        : "Configure Mapping"}
                    </Button>
                  ) : (
                    <div className="space-y-3 max-w-sm">
                      {jiraResources.length > 1 && (
                        <div className="space-y-1">
                          <Label>Jira Cloud Instance</Label>
                          <Select value={selectedCloudId} onValueChange={handleCloudSelect}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select instance" />
                            </SelectTrigger>
                            <SelectContent>
                              {jiraResources.map((cloud) => (
                                <SelectItem key={cloud.id} value={cloud.id}>{cloud.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label>Project</Label>
                        <Select value={selectedProjectKey} onValueChange={handleProjectSelect} disabled={!selectedCloudId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {(jiraResources.find((c) => c.id === selectedCloudId)?.projects || []).map((p) => (
                              <SelectItem key={p.key} value={p.key}>{p.name} ({p.key})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Issue Type</Label>
                        <Select
                          value={selectedIssueTypeId}
                          onValueChange={(id) => {
                            setSelectedIssueTypeId(id);
                            setSelectedIssueTypeName(issueTypes.find((t) => t.id === id)?.name || id);
                          }}
                          disabled={!selectedProjectKey || isLoadingIssueTypes}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingIssueTypes ? "Loading..." : "Select issue type"} />
                          </SelectTrigger>
                          <SelectContent>
                            {issueTypes.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSaveMapping}
                          disabled={isSavingMapping || !selectedCloudId || !selectedProjectKey || !selectedIssueTypeId}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                          {isSavingMapping
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                            : "Save Mapping"}
                        </Button>
                        {jiraHasMapping && (
                          <Button variant="outline" onClick={() => setShowMappingForm(false)}>Cancel</Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Status summary */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Integration Status</CardTitle>
              <CardDescription>Overview of your connected services</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
