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

interface NotionIntegrationData {
  status: string;
  workspaceName: string | null;
  databaseId: string | null;
  databaseName: string | null;
}

interface NotionDatabase {
  id: string;
  name: string;
  url: string;
}

interface LinearIntegrationData {
  status: string;
  linearTeamId: string | null;
  linearTeamName: string | null;
  linearProjectId: string | null;
  linearProjectName: string | null;
}

interface LinearTeam {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
}

interface AsanaIntegrationData {
  status: string;
  workspaceId: string | null;
  workspaceName: string | null;
  projectId: string | null;
  projectName: string | null;
}

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

  // Notion state
  const [notionData, setNotionData] = useState<NotionIntegrationData | null>(null);
  const [isNotionLoading, setIsNotionLoading] = useState(false);
  const [notionDatabases, setNotionDatabases] = useState<NotionDatabase[]>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [showNotionDbForm, setShowNotionDbForm] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState("");
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");
  const [isSavingDatabase, setIsSavingDatabase] = useState(false);
  const notionConnectedToastShown = useRef(false);

  // Linear state
  const [linearData, setLinearData] = useState<LinearIntegrationData | null>(null);
  const [isLinearLoading, setIsLinearLoading] = useState(false);
  const [linearTeams, setLinearTeams] = useState<LinearTeam[]>([]);
  const [isLoadingLinearTeams, setIsLoadingLinearTeams] = useState(false);
  const [showLinearMappingForm, setShowLinearMappingForm] = useState(false);
  const [selectedLinearTeamId, setSelectedLinearTeamId] = useState("");
  const [selectedLinearTeamName, setSelectedLinearTeamName] = useState("");
  const [selectedLinearProjectId, setSelectedLinearProjectId] = useState("");
  const [selectedLinearProjectName, setSelectedLinearProjectName] = useState("");
  const [isSavingLinearMapping, setIsSavingLinearMapping] = useState(false);
  const linearConnectedToastShown = useRef(false);

  // Asana state
  const [asanaData, setAsanaData] = useState<AsanaIntegrationData | null>(null);
  const [isAsanaLoading, setIsAsanaLoading] = useState(false);
  const [asanaWorkspaces, setAsanaWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [asanaProjects, setAsanaProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingAsanaWorkspaces, setIsLoadingAsanaWorkspaces] = useState(false);
  const [isLoadingAsanaProjects, setIsLoadingAsanaProjects] = useState(false);
  const [showAsanaMappingForm, setShowAsanaMappingForm] = useState(false);
  const [selectedAsanaWorkspaceId, setSelectedAsanaWorkspaceId] = useState("");
  const [selectedAsanaWorkspaceName, setSelectedAsanaWorkspaceName] = useState("");
  const [selectedAsanaProjectId, setSelectedAsanaProjectId] = useState("");
  const [selectedAsanaProjectName, setSelectedAsanaProjectName] = useState("");
  const [isSavingAsanaMapping, setIsSavingAsanaMapping] = useState(false);
  const asanaConnectedToastShown = useRef(false);

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

  // Notion Firestore listener
  useEffect(() => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) { setNotionData(null); return; }

    const notionRef = doc(db, "teams", teamId, "integrations", "notion");
    const unsubscribe = onSnapshot(notionRef, (snap) => {
      if (snap.exists()) {
        setNotionData(snap.data() as NotionIntegrationData);
        if (!notionConnectedToastShown.current) {
          notionConnectedToastShown.current = true;
          if (new URLSearchParams(window.location.search).get("notion_connected") === "true") {
            toast({ title: "Notion connected", description: "Now select a database to sync meetings to." });
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        setNotionData(null);
        notionConnectedToastShown.current = false;
      }
    }, (err) => console.error("[Integrations] Notion snapshot error:", err));
    return () => unsubscribe();
  }, [activeWorkspace, toast]);

  // Linear Firestore listener
  useEffect(() => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) { setLinearData(null); return; }

    const linearRef = doc(db, "teams", teamId, "integrations", "linear");
    const unsubscribe = onSnapshot(linearRef, (snap) => {
      if (snap.exists()) {
        setLinearData(snap.data() as LinearIntegrationData);
        if (!linearConnectedToastShown.current) {
          linearConnectedToastShown.current = true;
          if (new URLSearchParams(window.location.search).get("linear_connected") === "true") {
            toast({ title: "Linear connected", description: "Now configure your team mapping below." });
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        setLinearData(null);
        linearConnectedToastShown.current = false;
      }
    }, (err) => console.error("[Integrations] Linear snapshot error:", err));
    return () => unsubscribe();
  }, [activeWorkspace, toast]);

  // Asana Firestore listener
  useEffect(() => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) { setAsanaData(null); return; }

    const asanaRef = doc(db, "teams", teamId, "integrations", "asana");
    const unsubscribe = onSnapshot(asanaRef, (snap) => {
      if (snap.exists()) {
        setAsanaData(snap.data() as AsanaIntegrationData);
        if (!asanaConnectedToastShown.current) {
          asanaConnectedToastShown.current = true;
          if (new URLSearchParams(window.location.search).get("asana_connected") === "true") {
            toast({ title: "Asana connected", description: "Now configure your workspace and project below." });
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } else {
        setAsanaData(null);
        asanaConnectedToastShown.current = false;
      }
    }, (err) => console.error("[Integrations] Asana snapshot error:", err));
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

  // Notion handlers
  const handleConnectNotion = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsNotionLoading(true);
      const fns = getFunctions();
      const getUrl = httpsCallable<{ teamId: string }, { url: string }>(fns, "getNotionOAuthUrl");
      const response = await getUrl({ teamId });
      window.location.href = response.data.url;
    } catch {
      toast({ title: "Error", description: "Failed to start Notion connection.", variant: "destructive" });
      setIsNotionLoading(false);
    }
  };

  const handleDisconnectNotion = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsNotionLoading(true);
      const fns = getFunctions();
      await httpsCallable(fns, "disconnectNotionIntegration")({ teamId });
      setNotionData(null);
      setNotionDatabases([]);
      setShowNotionDbForm(false);
      toast({ title: "Disconnected", description: "Notion disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Notion.", variant: "destructive" });
    } finally {
      setIsNotionLoading(false);
    }
  };

  const handleLoadDatabases = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLoadingDatabases(true);
      const fns = getFunctions();
      const fn = httpsCallable<{ teamId: string }, { databases: NotionDatabase[] }>(fns, "getNotionDatabases");
      const result = await fn({ teamId });
      setNotionDatabases(result.data.databases);
      setShowNotionDbForm(true);
    } catch {
      toast({ title: "Error", description: "Failed to load Notion databases.", variant: "destructive" });
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  const handleSaveDatabase = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId || !selectedDatabaseId) {
      toast({ title: "Error", description: "Select a database first.", variant: "destructive" });
      return;
    }
    try {
      setIsSavingDatabase(true);
      const fns = getFunctions();
      await httpsCallable(fns, "saveNotionDatabase")({ teamId, databaseId: selectedDatabaseId, databaseName: selectedDatabaseName });
      setShowNotionDbForm(false);
      toast({ title: "Saved", description: `Meetings will sync to "${selectedDatabaseName}".` });
    } catch {
      toast({ title: "Error", description: "Failed to save database selection.", variant: "destructive" });
    } finally {
      setIsSavingDatabase(false);
    }
  };

  // Linear handlers
  const handleConnectLinear = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLinearLoading(true);
      const fns = getFunctions();
      const getUrl = httpsCallable<{ teamId: string }, { url: string }>(fns, "getLinearOAuthUrl");
      const response = await getUrl({ teamId });
      window.location.href = response.data.url;
    } catch {
      toast({ title: "Error", description: "Failed to start Linear connection.", variant: "destructive" });
      setIsLinearLoading(false);
    }
  };

  const handleDisconnectLinear = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLinearLoading(true);
      const fns = getFunctions();
      await httpsCallable(fns, "disconnectLinearIntegration")({ teamId });
      setLinearData(null);
      setLinearTeams([]);
      setShowLinearMappingForm(false);
      toast({ title: "Disconnected", description: "Linear disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Linear.", variant: "destructive" });
    } finally {
      setIsLinearLoading(false);
    }
  };

  const handleLoadLinearTeams = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLoadingLinearTeams(true);
      const fns = getFunctions();
      const fn = httpsCallable<{ teamId: string }, { teams: LinearTeam[] }>(fns, "getLinearTeams");
      const result = await fn({ teamId });
      setLinearTeams(result.data.teams);
      if (result.data.teams.length === 1) {
        setSelectedLinearTeamId(result.data.teams[0].id);
        setSelectedLinearTeamName(result.data.teams[0].name);
      }
      setShowLinearMappingForm(true);
    } catch {
      toast({ title: "Error", description: "Failed to load Linear teams.", variant: "destructive" });
    } finally {
      setIsLoadingLinearTeams(false);
    }
  };

  const handleLinearTeamSelect = (teamId: string) => {
    setSelectedLinearTeamId(teamId);
    setSelectedLinearTeamName(linearTeams.find((t) => t.id === teamId)?.name || teamId);
    setSelectedLinearProjectId("");
    setSelectedLinearProjectName("");
  };

  const handleSaveLinearMapping = async () => {
    const workspaceTeamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!workspaceTeamId || !selectedLinearTeamId) {
      toast({ title: "Error", description: "Select a Linear team.", variant: "destructive" });
      return;
    }
    try {
      setIsSavingLinearMapping(true);
      const fns = getFunctions();
      await httpsCallable(fns, "saveLinearMapping")({
        teamId: workspaceTeamId,
        linearTeamId: selectedLinearTeamId,
        linearTeamName: selectedLinearTeamName,
        linearProjectId: selectedLinearProjectId || null,
        linearProjectName: selectedLinearProjectName || null,
      });
      setShowLinearMappingForm(false);
      const projectPart = selectedLinearProjectName ? ` · ${selectedLinearProjectName}` : "";
      toast({ title: "Saved", description: `Linear mapped to ${selectedLinearTeamName}${projectPart}.` });
    } catch {
      toast({ title: "Error", description: "Failed to save mapping.", variant: "destructive" });
    } finally {
      setIsSavingLinearMapping(false);
    }
  };

  // Asana handlers
  const handleConnectAsana = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsAsanaLoading(true);
      const fns = getFunctions();
      const getUrl = httpsCallable<{ teamId: string }, { url: string }>(fns, "getAsanaOAuthUrl");
      const response = await getUrl({ teamId });
      window.location.href = response.data.url;
    } catch {
      toast({ title: "Error", description: "Failed to start Asana connection.", variant: "destructive" });
      setIsAsanaLoading(false);
    }
  };

  const handleDisconnectAsana = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsAsanaLoading(true);
      const fns = getFunctions();
      await httpsCallable(fns, "disconnectAsanaIntegration")({ teamId });
      setAsanaData(null);
      setAsanaWorkspaces([]);
      setAsanaProjects([]);
      setShowAsanaMappingForm(false);
      toast({ title: "Disconnected", description: "Asana disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Asana.", variant: "destructive" });
    } finally {
      setIsAsanaLoading(false);
    }
  };

  const handleLoadAsanaWorkspaces = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId) return;
    try {
      setIsLoadingAsanaWorkspaces(true);
      const fns = getFunctions();
      const fn = httpsCallable<{ teamId: string }, { workspaces: Array<{ id: string; name: string }> }>(fns, "getAsanaWorkspaces");
      const result = await fn({ teamId });
      setAsanaWorkspaces(result.data.workspaces);
      if (result.data.workspaces.length === 1) {
        setSelectedAsanaWorkspaceId(result.data.workspaces[0].id);
        setSelectedAsanaWorkspaceName(result.data.workspaces[0].name);
        await handleLoadAsanaProjects(result.data.workspaces[0].id);
      }
      setShowAsanaMappingForm(true);
    } catch {
      toast({ title: "Error", description: "Failed to load Asana workspaces.", variant: "destructive" });
    } finally {
      setIsLoadingAsanaWorkspaces(false);
    }
  };

  const handleLoadAsanaProjects = async (workspaceId: string) => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId || !workspaceId) return;
    try {
      setIsLoadingAsanaProjects(true);
      const fns = getFunctions();
      const fn = httpsCallable<{ teamId: string; workspaceId: string }, { projects: Array<{ id: string; name: string }> }>(fns, "getAsanaProjects");
      const result = await fn({ teamId, workspaceId });
      setAsanaProjects(result.data.projects);
    } catch {
      toast({ title: "Error", description: "Failed to load Asana projects.", variant: "destructive" });
    } finally {
      setIsLoadingAsanaProjects(false);
    }
  };

  const handleAsanaWorkspaceSelect = async (workspaceId: string) => {
    setSelectedAsanaWorkspaceId(workspaceId);
    setSelectedAsanaWorkspaceName(asanaWorkspaces.find((w) => w.id === workspaceId)?.name || workspaceId);
    setSelectedAsanaProjectId("");
    setSelectedAsanaProjectName("");
    setAsanaProjects([]);
    await handleLoadAsanaProjects(workspaceId);
  };

  const handleSaveAsanaMapping = async () => {
    const teamId = activeWorkspace?.type === "team" ? activeWorkspace.id : null;
    if (!teamId || !selectedAsanaWorkspaceId || !selectedAsanaProjectId) {
      toast({ title: "Error", description: "Select a workspace and project.", variant: "destructive" });
      return;
    }
    try {
      setIsSavingAsanaMapping(true);
      const fns = getFunctions();
      await httpsCallable(fns, "saveAsanaMapping")({
        teamId,
        workspaceId: selectedAsanaWorkspaceId,
        workspaceName: selectedAsanaWorkspaceName,
        projectId: selectedAsanaProjectId,
        projectName: selectedAsanaProjectName,
      });
      setShowAsanaMappingForm(false);
      toast({ title: "Saved", description: `Asana tasks will go to "${selectedAsanaProjectName}".` });
    } catch {
      toast({ title: "Error", description: "Failed to save mapping.", variant: "destructive" });
    } finally {
      setIsSavingAsanaMapping(false);
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
  const notionIsConnected = notionData?.status === "connected";
  const notionHasDatabase = notionIsConnected && !!notionData?.databaseId;
  const linearIsConnected = linearData?.status === "connected";
  const linearHasMapping = linearIsConnected && !!linearData?.linearTeamId;
  const asanaIsConnected = asanaData?.status === "connected";
  const asanaHasMapping = asanaIsConnected && !!asanaData?.projectId;

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

          {/* Notion */}
          {!teamId ? (
            <Card className="border-0 shadow-lg opacity-60">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-600">N</span>
                  </div>
                  <div>
                    <CardTitle>Notion</CardTitle>
                    <CardDescription>Switch to a team workspace to connect Notion</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card className={`border-0 shadow-lg ${notionIsConnected ? "border-l-4 border-l-green-500" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-700">N</span>
                    </div>
                    <div>
                      <CardTitle>Notion</CardTitle>
                      <CardDescription>
                        {notionHasDatabase
                          ? `Syncing to "${notionData!.databaseName}"`
                          : notionIsConnected && notionData?.workspaceName
                          ? `Connected to ${notionData.workspaceName}`
                          : "Auto-sync meeting summaries to Notion"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {notionIsConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                      </Badge>
                    )}
                    {notionIsConnected ? (
                      <div className="flex items-center gap-2">
                        {notionHasDatabase && (
                          <Button size="sm" variant="outline" onClick={handleLoadDatabases} disabled={isLoadingDatabases}>
                            {isLoadingDatabases ? <Loader2 className="w-3 h-3 animate-spin" /> : "Change Database"}
                          </Button>
                        )}
                        <Button variant="outline" onClick={handleDisconnectNotion} disabled={isNotionLoading}>
                          {isNotionLoading ? "Processing..." : "Disconnect"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleConnectNotion}
                        disabled={isNotionLoading}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        {isNotionLoading ? "Connecting..." : "Connect Notion"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Database selector — shown when connected but no database yet, or when changing */}
              {notionIsConnected && (!notionHasDatabase || showNotionDbForm) && (
                <CardContent className="space-y-3 pt-0">
                  <p className="text-sm text-gray-500">
                    {notionHasDatabase ? "Select a different database:" : "Select the Notion database to sync meetings to:"}
                  </p>

                  {!showNotionDbForm ? (
                    <Button variant="outline" onClick={handleLoadDatabases} disabled={isLoadingDatabases}>
                      {isLoadingDatabases
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading databases...</>
                        : "Select Database"}
                    </Button>
                  ) : (
                    <div className="space-y-3 max-w-sm">
                      <div className="space-y-1">
                        <Label>Database</Label>
                        <Select
                          value={selectedDatabaseId}
                          onValueChange={(id) => {
                            setSelectedDatabaseId(id);
                            setSelectedDatabaseName(notionDatabases.find((d) => d.id === id)?.name || id);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a database" />
                          </SelectTrigger>
                          <SelectContent>
                            {notionDatabases.map((db) => (
                              <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSaveDatabase}
                          disabled={isSavingDatabase || !selectedDatabaseId}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                          {isSavingDatabase
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                            : "Save"}
                        </Button>
                        {notionHasDatabase && (
                          <Button variant="outline" onClick={() => setShowNotionDbForm(false)}>Cancel</Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Linear */}
          {!teamId ? (
            <Card className="border-0 shadow-lg opacity-60">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl font-bold text-indigo-600">L</span>
                  </div>
                  <div>
                    <CardTitle>Linear</CardTitle>
                    <CardDescription>Switch to a team workspace to connect Linear</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card className={`border-0 shadow-lg ${linearIsConnected ? "border-l-4 border-l-green-500" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold text-indigo-600">L</span>
                    </div>
                    <div>
                      <CardTitle>Linear</CardTitle>
                      <CardDescription>
                        {linearHasMapping
                          ? `${linearData!.linearTeamName}${linearData!.linearProjectName ? ` · ${linearData!.linearProjectName}` : ""}`
                          : "Create Linear issues from action items"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {linearIsConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                      </Badge>
                    )}
                    {linearIsConnected ? (
                      <div className="flex items-center gap-2">
                        {linearHasMapping && (
                          <Button size="sm" variant="outline" onClick={handleLoadLinearTeams} disabled={isLoadingLinearTeams}>
                            {isLoadingLinearTeams ? <Loader2 className="w-3 h-3 animate-spin" /> : "Edit Mapping"}
                          </Button>
                        )}
                        <Button variant="outline" onClick={handleDisconnectLinear} disabled={isLinearLoading}>
                          {isLinearLoading ? "Processing..." : "Disconnect"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleConnectLinear}
                        disabled={isLinearLoading}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        {isLinearLoading ? "Connecting..." : "Connect Linear"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {linearIsConnected && (!linearHasMapping || showLinearMappingForm) && (
                <CardContent className="space-y-4 pt-0">
                  <p className="text-sm text-gray-500">
                    {linearHasMapping ? "Update your team mapping:" : "Select where action items should be sent:"}
                  </p>

                  {!showLinearMappingForm ? (
                    <Button variant="outline" onClick={handleLoadLinearTeams} disabled={isLoadingLinearTeams}>
                      {isLoadingLinearTeams
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading teams...</>
                        : "Configure Mapping"}
                    </Button>
                  ) : (
                    <div className="space-y-3 max-w-sm">
                      <div className="space-y-1">
                        <Label>Linear Team</Label>
                        <Select value={selectedLinearTeamId} onValueChange={handleLinearTeamSelect}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {linearTeams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Project (optional)</Label>
                        <Select
                          value={selectedLinearProjectId}
                          onValueChange={(id) => {
                            setSelectedLinearProjectId(id);
                            const team = linearTeams.find((t) => t.id === selectedLinearTeamId);
                            setSelectedLinearProjectName(team?.projects.find((p) => p.id === id)?.name || id);
                          }}
                          disabled={!selectedLinearTeamId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="No project (team backlog)" />
                          </SelectTrigger>
                          <SelectContent>
                            {(linearTeams.find((t) => t.id === selectedLinearTeamId)?.projects || []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSaveLinearMapping}
                          disabled={isSavingLinearMapping || !selectedLinearTeamId}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                          {isSavingLinearMapping
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                            : "Save Mapping"}
                        </Button>
                        {linearHasMapping && (
                          <Button variant="outline" onClick={() => setShowLinearMappingForm(false)}>Cancel</Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* Asana */}
          {!teamId ? (
            <Card className="border-0 shadow-lg opacity-60">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600">A</span>
                  </div>
                  <div>
                    <CardTitle>Asana</CardTitle>
                    <CardDescription>Switch to a team workspace to connect Asana</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card className={`border-0 shadow-lg ${asanaIsConnected ? "border-l-4 border-l-green-500" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl font-bold text-orange-600">A</span>
                    </div>
                    <div>
                      <CardTitle>Asana</CardTitle>
                      <CardDescription>
                        {asanaHasMapping
                          ? `${asanaData!.workspaceName} · ${asanaData!.projectName}`
                          : "Create Asana tasks from action items"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {asanaIsConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="w-3 h-3 mr-1" />Not Configured
                      </Badge>
                    )}
                    {asanaIsConnected ? (
                      <div className="flex items-center gap-2">
                        {asanaHasMapping && (
                          <Button size="sm" variant="outline" onClick={handleLoadAsanaWorkspaces} disabled={isLoadingAsanaWorkspaces}>
                            {isLoadingAsanaWorkspaces ? <Loader2 className="w-3 h-3 animate-spin" /> : "Edit Mapping"}
                          </Button>
                        )}
                        <Button variant="outline" onClick={handleDisconnectAsana} disabled={isAsanaLoading}>
                          {isAsanaLoading ? "Processing..." : "Disconnect"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleConnectAsana}
                        disabled={isAsanaLoading}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        {isAsanaLoading ? "Connecting..." : "Connect Asana"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {asanaIsConnected && (!asanaHasMapping || showAsanaMappingForm) && (
                <CardContent className="space-y-4 pt-0">
                  <p className="text-sm text-gray-500">
                    {asanaHasMapping ? "Update your project mapping:" : "Select where action items should be sent:"}
                  </p>

                  {!showAsanaMappingForm ? (
                    <Button variant="outline" onClick={handleLoadAsanaWorkspaces} disabled={isLoadingAsanaWorkspaces}>
                      {isLoadingAsanaWorkspaces
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading workspaces...</>
                        : "Configure Mapping"}
                    </Button>
                  ) : (
                    <div className="space-y-3 max-w-sm">
                      <div className="space-y-1">
                        <Label>Workspace</Label>
                        <Select value={selectedAsanaWorkspaceId} onValueChange={handleAsanaWorkspaceSelect}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select workspace" />
                          </SelectTrigger>
                          <SelectContent>
                            {asanaWorkspaces.map((w) => (
                              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Project</Label>
                        <Select
                          value={selectedAsanaProjectId}
                          onValueChange={(id) => {
                            setSelectedAsanaProjectId(id);
                            setSelectedAsanaProjectName(asanaProjects.find((p) => p.id === id)?.name || id);
                          }}
                          disabled={!selectedAsanaWorkspaceId || isLoadingAsanaProjects}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingAsanaProjects ? "Loading..." : "Select project"} />
                          </SelectTrigger>
                          <SelectContent>
                            {asanaProjects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSaveAsanaMapping}
                          disabled={isSavingAsanaMapping || !selectedAsanaWorkspaceId || !selectedAsanaProjectId}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                          {isSavingAsanaMapping
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                            : "Save Mapping"}
                        </Button>
                        {asanaHasMapping && (
                          <Button variant="outline" onClick={() => setShowAsanaMappingForm(false)}>Cancel</Button>
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
