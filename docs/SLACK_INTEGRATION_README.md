# HuddleAI Slack Integration

This document explains how to set up and use the Slack integration feature in HuddleAI, which automatically sends meeting summaries to your Slack channels when meetings are processed.

## Features

- 🎥 **Automatic Notifications**: Get notified in Slack when new meetings are processed
- 📝 **AI-Generated Summaries**: Receive comprehensive meeting summaries with key insights
- ✅ **Action Items**: See extracted action items with assignments
- 🎯 **Decisions Made**: Track important decisions from meetings
- 💬 **Topics Discussed**: Overview of all topics covered
- 🔗 **Direct Links**: Quick access to full meeting details

## Setup Instructions

### Step 1: Create a Slack App

1. Go to [Slack API](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. Enter your app name (e.g., "HuddleAI")
5. Select your workspace

### Step 2: Enable Incoming Webhooks

1. In your Slack app settings, go to "Features" → "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to **On**
3. Click "Add New Webhook to Workspace"
4. Select the channel where you want to receive notifications
5. Click "Allow"
6. Copy the webhook URL (it should look like: `https://hooks.slack.com/services/T.../B.../...`)

### Step 3: Get Channel Information

1. In Slack, right-click on your target channel
2. Select "View channel details"
3. Copy the Channel ID (at the bottom of the details panel)
4. Note the channel name (without the # symbol)

### Step 4: Configure in HuddleAI

1. Go to your team settings in HuddleAI
2. Find the "Slack Integration" section
3. Fill in the form:
   - **Channel Name**: The name of your Slack channel (without #)
   - **Channel ID**: The ID you copied from Slack
   - **Webhook URL**: The webhook URL from Step 2
4. Click "Create Integration"
5. Test the integration by clicking "Test"

## What Gets Sent to Slack

When a meeting is processed, HuddleAI will send a rich message to your Slack channel containing:

### Meeting Information
- Meeting title
- Duration
- Upload date
- Uploaded by (user name)

### AI-Generated Content
- **Summary**: High-level overview of the meeting
- **Topics Discussed**: List of main topics covered
- **Action Items**: Tasks with assignments (if detected)
- **Decisions Made**: Important decisions from the meeting
- **Follow-up Questions**: Items requiring further discussion

### Quick Actions
- **View Meeting Details**: Direct link to the full meeting in HuddleAI

## Example Slack Message

```
🎥 New Meeting Processed

Meeting: Weekly Team Standup
Duration: 45 mins
Uploaded by: John Doe
Date: December 15, 2024

📝 AI Summary:
The team discussed project progress, upcoming deadlines, and resource allocation. Key decisions were made regarding the Q1 roadmap and new feature prioritization.

💬 Topics Discussed:
• Project status updates
• Q1 roadmap planning
• Resource allocation
• New feature prioritization

✅ Action Items:
• Update project timeline - Assigned to: Sarah (Due: Dec 20)
• Review budget proposal - Assigned to: Mike
• Schedule client meeting - Assigned to: John

🎯 Decisions Made:
• Approved Q1 roadmap with focus on mobile features
• Increased budget for development team
• Weekly client check-ins starting January

[View Meeting Details] (Button)
```

## Managing Your Integration

### Update Integration
1. Go to team settings
2. Click "Edit" on your Slack integration
3. Update any fields as needed
4. Click "Update Integration"

### Test Integration
1. Click the "Test" button in your integration settings
2. Check your Slack channel for a test message
3. If successful, you'll see a confirmation message

### Remove Integration
1. Click "Remove" on your Slack integration
2. Confirm the removal
3. You'll stop receiving notifications immediately

## Troubleshooting

### Common Issues

**"Invalid Slack webhook URL" Error**
- Ensure your webhook URL starts with `https://hooks.slack.com/services/`
- Make sure you copied the complete URL from Slack

**"No active integration found" Error**
- Check that your integration is properly saved
- Verify you have the correct team selected

**Test Message Not Appearing**
- Check the webhook URL is correct
- Verify the Slack app has permission to post to the channel
- Ensure the channel still exists

**No Notifications for New Meetings**
- Check that meetings are being processed successfully
- Verify your integration is still active
- Check Slack app permissions

### Getting Help

If you continue to experience issues:

1. Check the Firebase Functions logs for error details
2. Verify your Slack app permissions
3. Test the webhook URL directly using curl:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     YOUR_WEBHOOK_URL
   ```

## Technical Details

### Architecture
- **Frontend**: React component for managing integrations
- **Backend**: Firebase Cloud Functions for processing and sending notifications
- **Storage**: Firestore for storing integration configurations
- **API**: Slack Incoming Webhooks for message delivery

### Security
- Webhook URLs are stored securely in Firestore
- Only team owners and admins can manage integrations
- All API calls are authenticated through Firebase Auth

### Rate Limits
- Slack webhooks have rate limits (1 message per second)
- HuddleAI respects these limits automatically
- Large teams may experience slight delays in notifications

## API Reference

### Cloud Function: `manageSlackIntegration`

**Create Integration**
```javascript
{
  action: 'create',
  teamId: 'team-id',
  userId: 'user-id',
  channelId: 'C1234567890',
  channelName: 'general',
  webhookUrl: 'https://hooks.slack.com/services/...'
}
```

**Update Integration**
```javascript
{
  action: 'update',
  teamId: 'team-id',
  userId: 'user-id',
  integrationId: 'integration-id',
  channelName: 'new-channel-name'
}
```

**Test Integration**
```javascript
{
  action: 'test',
  teamId: 'team-id',
  userId: 'user-id'
}
```

**Delete Integration**
```javascript
{
  action: 'delete',
  teamId: 'team-id',
  userId: 'user-id'
}
```

## Support

For additional support or feature requests, please contact the HuddleAI team or create an issue in the project repository. 