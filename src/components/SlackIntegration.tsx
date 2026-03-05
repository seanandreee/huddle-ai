import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Slack, Check, X, TestTube, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface SlackIntegrationProps {
  teamId: string;
  currentIntegration?: {
    id: string;
    channelId: string;
    channelName: string;
    webhookUrl: string;
    isActive: boolean;
  } | null;
  onIntegrationChange: () => void;
}

export const SlackIntegration: React.FC<SlackIntegrationProps> = ({
  teamId,
  currentIntegration,
  onIntegrationChange
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showForm, setShowForm] = useState(!currentIntegration);
  const [formData, setFormData] = useState({
    channelId: currentIntegration?.channelId || '',
    channelName: currentIntegration?.channelName || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const manageSlackIntegration = httpsCallable(functions, 'manageSlackIntegration');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const action = currentIntegration ? 'update' : 'create';
      const data: any = {
        action,
        teamId,
        userId: user.uid,
        ...formData
      };

      if (action === 'update' && currentIntegration) {
        data.integrationId = currentIntegration.id;
      }

      await manageSlackIntegration(data);
      
      setSuccess(currentIntegration ? 'Slack integration updated successfully!' : 'Slack integration created successfully!');
      setShowForm(false);
      onIntegrationChange();
    } catch (err: any) {
      setError(err.message || 'Failed to save Slack integration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!user) return;

    setIsTesting(true);
    setError(null);
    setSuccess(null);

    try {
      await manageSlackIntegration({
        action: 'test',
        teamId,
        userId: user.uid
      });
      
      setSuccess('Test message sent to Slack! Check your channel.');
    } catch (err: any) {
      setError(err.message || 'Failed to send test message');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !confirm('Are you sure you want to remove the Slack integration?')) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await manageSlackIntegration({
        action: 'delete',
        teamId,
        userId: user.uid
      });
      
      setSuccess('Slack integration removed successfully!');
      setShowForm(true);
      onIntegrationChange();
    } catch (err: any) {
      setError(err.message || 'Failed to remove Slack integration');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      channelId: currentIntegration?.channelId || '',
      channelName: currentIntegration?.channelName || '',
    });
    setError(null);
    setSuccess(null);
  };

  useEffect(() => {
    resetForm();
  }, [currentIntegration]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Slack className="h-5 w-5" />
          Slack Integration
        </CardTitle>
        <CardDescription>
          Automatically send meeting summaries to your Slack channel when meetings are processed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <X className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {currentIntegration && !showForm && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">#{currentIntegration.channelName}</div>
                <div className="text-sm text-gray-500">
                  Channel ID: {currentIntegration.channelId}
                </div>
                <div className="text-sm text-green-600 flex items-center gap-1 mt-1">
                  <Check className="h-3 w-3" />
                  Active
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                >
                  <TestTube className="h-4 w-4 mr-1" />
                  {isTesting ? 'Testing...' : 'Test'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(true)}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="channelName">Channel Name</Label>
              <Input
                id="channelName"
                placeholder="e.g., general, team-updates"
                value={formData.channelName}
                onChange={(e) => setFormData({ ...formData, channelName: e.target.value })}
                required
              />
              <p className="text-sm text-gray-500">
                The name of the Slack channel (without #)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="channelId">Channel ID</Label>
              <Input
                id="channelId"
                placeholder="e.g., C1234567890"
                value={formData.channelId}
                onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                required
              />
              <p className="text-sm text-gray-500">
                Find this in Slack: Right-click channel → View channel details → Copy channel ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                placeholder="https://hooks.slack.com/services/..."
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                required
                type="url"
              />
              <p className="text-sm text-gray-500">
                Create an incoming webhook in your Slack app settings
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : currentIntegration ? 'Update Integration' : 'Create Integration'}
              </Button>
              {currentIntegration && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {!currentIntegration && !showForm && (
          <div className="text-center py-8">
            <Slack className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Slack Integration</h3>
            <p className="text-gray-500 mb-4">
              Connect your team's Slack workspace to receive meeting summaries automatically.
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Slack className="h-4 w-4 mr-2" />
              Set Up Slack Integration
            </Button>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">How to set up Slack integration:</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Go to your Slack workspace settings</li>
            <li>Create a new app or use an existing one</li>
            <li>Enable "Incoming Webhooks" feature</li>
            <li>Create a new webhook for your desired channel</li>
            <li>Copy the webhook URL and channel information here</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}; 