import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Slack, Send, Check, X, Edit3, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { format } from 'date-fns';

interface SlackNotificationProps {
  meetingId: string;
  teamId: string;
  meetingTitle: string;
  slackIntegration?: {
    channelName: string;
    isActive: boolean;
  } | null;
  notificationStatus?: {
    sent: boolean;
    sentAt?: any;
    sentBy?: string;
  };
  onNotificationSent: () => void;
}

export const SlackNotification: React.FC<SlackNotificationProps> = ({
  meetingId,
  teamId,
  meetingTitle,
  slackIntegration,
  notificationStatus,
  onNotificationSent
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showCustomMessage, setShowCustomMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sendMeetingToSlack = httpsCallable(functions, 'sendMeetingToSlack');

  const handleSendToSlack = async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await sendMeetingToSlack({
        meetingId,
        teamId,
        userId: user.uid,
        customMessage: customMessage.trim() || undefined
      });

      const data = result.data as any;
      setSuccess(`Meeting summary sent to #${data.channelName} successfully!`);
      setCustomMessage('');
      setShowCustomMessage(false);
      onNotificationSent();
    } catch (err: any) {
      setError(err.message || 'Failed to send meeting to Slack');
    } finally {
      setIsLoading(false);
    }
  };

  const getDefaultMessage = () => {
    return `📋 Here's the summary from our "${meetingTitle}" meeting. Check out the key insights and action items below!`;
  };

  if (!slackIntegration || !slackIntegration.isActive) {
    return (
      <Card className="border-dashed border-gray-300">
        <CardContent className="text-center py-8">
          <Slack className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">Slack Integration Not Set Up</h3>
          <p className="text-gray-500 mb-4">
            Connect your team's Slack workspace to share meeting summaries.
          </p>
          <Button variant="outline" size="sm">
            <Slack className="h-4 w-4 mr-2" />
            Set Up Slack Integration
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Slack className="h-5 w-5 text-purple-600" />
            Share to Slack
          </div>
          {notificationStatus?.sent && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <Check className="h-3 w-3 mr-1" />
              Sent
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Share this meeting summary with your team in #{slackIntegration.channelName}
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

        {notificationStatus?.sent && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-800 text-sm">
              <Check className="h-4 w-4" />
              <span className="font-medium">Already shared to Slack</span>
            </div>
            {notificationStatus.sentAt && (
              <p className="text-green-700 text-xs mt-1">
                Sent on {format(notificationStatus.sentAt.toDate(), 'PPp')}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {!showCustomMessage ? (
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-gray-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{getDefaultMessage()}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Default message with meeting summary and action items
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSendToSlack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send to #{slackIntegration.channelName}
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setShowCustomMessage(true)}
                  disabled={isLoading}
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Customize
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Custom Message (Optional)
                </label>
                <Textarea
                  placeholder={getDefaultMessage()}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-gray-500">
                  Add a personal note or context. Leave empty to use the default message.
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSendToSlack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send to #{slackIntegration.channelName}
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowCustomMessage(false);
                    setCustomMessage('');
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Slack className="h-3 w-3" />
            <span>Connected to #{slackIntegration.channelName}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}; 