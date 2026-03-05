import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import LogoutButton from './LogoutButton';

const UserProfile = () => {
  const { currentUser, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');

  // Get initials for avatar fallback
  const getInitials = () => {
    if (!currentUser?.displayName) return '?';
    return currentUser.displayName
      .split(' ')
      .map(name => name[0])
      .join('')
      .toUpperCase();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid name',
        description: 'Please enter a valid name.'
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateUserProfile(displayName);
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully.'
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: 'There was an error updating your profile.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={currentUser?.photoURL || ''} alt={currentUser?.displayName || 'User'} />
            <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
          </Avatar>
        </div>
        <CardTitle>{!isEditing ? currentUser?.displayName : 'Edit Profile'}</CardTitle>
        <CardDescription>{currentUser?.email}</CardDescription>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
                placeholder="Enter your name"
              />
            </div>
            <div className="flex justify-between">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsEditing(false);
                  setDisplayName(currentUser?.displayName || '');
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Email</h3>
              <p className="mt-1">{currentUser?.email}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Account created</h3>
              <p className="mt-1">{currentUser?.metadata.creationTime ? new Date(currentUser.metadata.creationTime).toLocaleDateString() : 'Unknown'}</p>
            </div>
            <Button 
              onClick={() => setIsEditing(true)} 
              variant="outline" 
              className="w-full"
            >
              Edit Profile
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <LogoutButton variant="destructive" className="w-full" />
      </CardFooter>
    </Card>
  );
};

export default UserProfile; 