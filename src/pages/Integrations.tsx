
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ArrowLeft, Settings, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

const Integrations = () => {
  const [integrations, setIntegrations] = useState({
    slack: { enabled: true, configured: true },
    jira: { enabled: false, configured: false }
  });

  const [slackConfig, setSlackConfig] = useState({
    webhookUrl: "https://hooks.slack.com/services/...",
    channel: "#standup-updates"
  });

  const [jiraConfig, setJiraConfig] = useState({
    serverUrl: "",
    username: "",
    apiToken: "",
    projectKey: ""
  });

  const toggleIntegration = (integration: 'slack' | 'jira') => {
    setIntegrations(prev => ({
      ...prev,
      [integration]: {
        ...prev[integration],
        enabled: !prev[integration].enabled
      }
    }));
  };

  const testSlackConnection = () => {
    console.log("Testing Slack connection...");
    alert("Slack test message sent successfully!");
  };

  const saveJiraConfig = () => {
    console.log("Saving Jira configuration:", jiraConfig);
    setIntegrations(prev => ({
      ...prev,
      jira: { ...prev.jira, configured: true }
    }));
    alert("Jira integration configured successfully!");
  };

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
          {/* Slack Integration */}
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
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Not Configured
                    </Badge>
                  )}
                  <Switch
                    checked={integrations.slack.enabled}
                    onCheckedChange={() => toggleIntegration('slack')}
                  />
                </div>
              </div>
            </CardHeader>
            {integrations.slack.enabled && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Slack Webhook URL</Label>
                  <Input
                    id="webhookUrl"
                    value={slackConfig.webhookUrl}
                    onChange={(e) => setSlackConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Default Channel</Label>
                  <Input
                    id="channel"
                    value={slackConfig.channel}
                    onChange={(e) => setSlackConfig(prev => ({ ...prev, channel: e.target.value }))}
                    placeholder="#standup-updates"
                  />
                </div>
                <div className="flex space-x-3">
                  <Button onClick={testSlackConnection} variant="outline">
                    Test Connection
                  </Button>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    Save Configuration
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Jira Integration */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="font-bold text-blue-600">J</span>
                  </div>
                  <div>
                    <CardTitle>Jira</CardTitle>
                    <CardDescription>Automatically create tickets from action items</CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {integrations.jira.configured ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Not Configured
                    </Badge>
                  )}
                  <Switch
                    checked={integrations.jira.enabled}
                    onCheckedChange={() => toggleIntegration('jira')}
                  />
                </div>
              </div>
            </CardHeader>
            {integrations.jira.enabled && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="serverUrl">Jira Server URL</Label>
                    <Input
                      id="serverUrl"
                      value={jiraConfig.serverUrl}
                      onChange={(e) => setJiraConfig(prev => ({ ...prev, serverUrl: e.target.value }))}
                      placeholder="https://yourcompany.atlassian.net"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectKey">Project Key</Label>
                    <Input
                      id="projectKey"
                      value={jiraConfig.projectKey}
                      onChange={(e) => setJiraConfig(prev => ({ ...prev, projectKey: e.target.value }))}
                      placeholder="PROJ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username/Email</Label>
                    <Input
                      id="username"
                      value={jiraConfig.username}
                      onChange={(e) => setJiraConfig(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="your.email@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiToken">API Token</Label>
                    <Input
                      id="apiToken"
                      type="password"
                      value={jiraConfig.apiToken}
                      onChange={(e) => setJiraConfig(prev => ({ ...prev, apiToken: e.target.value }))}
                      placeholder="Your Jira API token"
                    />
                  </div>
                </div>
                <div className="flex space-x-3">
                  <Button variant="outline">Test Connection</Button>
                  <Button onClick={saveJiraConfig} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    Save Configuration
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Integration Status Summary */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Integration Status</CardTitle>
              <CardDescription>Overview of your connected services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Active Integrations</h4>
                  <p className="text-2xl font-bold text-green-600">
                    {Object.values(integrations).filter(i => i.enabled && i.configured).length}
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Available Integrations</h4>
                  <p className="text-2xl font-bold text-blue-600">
                    {Object.keys(integrations).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
