import { useState, useEffect } from 'react';
import { 
  getTeamActionItems, 
  createActionItem, 
  updateActionItem, 
  deleteActionItem, 
  updateActionItemStatus,
  ActionItem 
} from '@/lib/db';

export interface ExtendedActionItem extends ActionItem {
  teamId: string;
  meetingTitle?: string;
}

export interface UseActionItemsOptions {
  teamId: string;
  userId?: string;
  autoRefresh?: boolean;
}

export interface UseActionItemsReturn {
  actionItems: ExtendedActionItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createItem: (itemData: {
    description: string;
    assignedTo?: string;
    assignedToName?: string;
    dueDate?: string;
    status?: 'pending' | 'in-progress' | 'completed';
    meetingId: string;
  }) => Promise<string>;
  updateItem: (
    itemId: string,
    meetingId: string,
    updates: Partial<{
      description: string;
      assignedTo: string;
      assignedToName: string;
      dueDate: string;
      status: 'pending' | 'in-progress' | 'completed';
    }>
  ) => Promise<boolean>;
  updateStatus: (itemId: string, meetingId: string, status: 'pending' | 'in-progress' | 'completed') => Promise<boolean>;
  deleteItem: (itemId: string, meetingId: string) => Promise<boolean>;
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
}

export const useActionItems = ({
  teamId,
  userId,
  autoRefresh = false
}: UseActionItemsOptions): UseActionItemsReturn => {
  const [actionItems, setActionItems] = useState<ExtendedActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActionItems = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Security check: Don't fetch if teamId is empty
      if (!teamId || teamId.trim() === '') {
        console.warn("useActionItems: teamId is empty, clearing action items");
        setActionItems([]);
        return;
      }
      
      const items = await getTeamActionItems(teamId, userId);
      setActionItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch action items');
      console.error('Error fetching action items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Always call fetchActionItems, let it handle empty teamId
    fetchActionItems();
  }, [teamId, userId]);

  useEffect(() => {
    if (autoRefresh && teamId && teamId.trim() !== '') {
      const interval = setInterval(fetchActionItems, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, teamId, userId]);

  const refetch = async () => {
    await fetchActionItems();
  };

  const createItem = async (itemData: {
    description: string;
    assignedTo?: string;
    assignedToName?: string;
    dueDate?: string;
    status?: 'pending' | 'in-progress' | 'completed';
    meetingId: string;
  }) => {
    try {
      const newItemId = await createActionItem({
        ...itemData,
        teamId
      });
      await refetch(); // Refresh the list
      return newItemId;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create action item');
    }
  };

  const updateItem = async (
    itemId: string,
    meetingId: string,
    updates: Partial<{
      description: string;
      assignedTo: string;
      assignedToName: string;
      dueDate: string;
      status: 'pending' | 'in-progress' | 'completed';
    }>
  ) => {
    try {
      const success = await updateActionItem(itemId, meetingId, updates);
      if (success) {
        await refetch(); // Refresh the list
      }
      return success;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update action item');
    }
  };

  const updateStatus = async (itemId: string, meetingId: string, status: 'pending' | 'in-progress' | 'completed') => {
    try {
      const success = await updateActionItemStatus(itemId, meetingId, status);
      if (success) {
        await refetch(); // Refresh the list
      }
      return success;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update action item status');
    }
  };

  const deleteItem = async (itemId: string, meetingId: string) => {
    try {
      const success = await deleteActionItem(itemId, meetingId);
      if (success) {
        await refetch(); // Refresh the list
      }
      return success;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete action item');
    }
  };

  // Calculate statistics
  const stats = {
    total: actionItems.length,
    pending: actionItems.filter(item => item.status === 'pending').length,
    inProgress: actionItems.filter(item => item.status === 'in-progress').length,
    completed: actionItems.filter(item => item.status === 'completed').length,
    overdue: actionItems.filter(item => {
      if (!item.dueDate) return false;
      const dueDate = new Date(item.dueDate);
      const now = new Date();
      return dueDate < now && item.status !== 'completed';
    }).length
  };

  return {
    actionItems,
    isLoading,
    error,
    refetch,
    createItem,
    updateItem,
    updateStatus,
    deleteItem,
    stats
  };
}; 