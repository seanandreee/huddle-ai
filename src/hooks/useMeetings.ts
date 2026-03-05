import { useState, useEffect } from 'react';
import { getAllMeetingsForTeam, Meeting } from '@/lib/db';

export interface UseMeetingsOptions {
  teamId: string;
  userId?: string;
  orderByField?: 'date' | 'createdAt';
  orderDirection?: 'desc' | 'asc';
  statusFilter?: 'uploaded' | 'processing' | 'processed' | 'failed';
}

export interface UseMeetingsReturn {
  meetings: Meeting[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useMeetings = ({
  teamId,
  userId,
  orderByField = 'date',
  orderDirection = 'desc',
  statusFilter
}: UseMeetingsOptions): UseMeetingsReturn => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeetings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Security check: Don't fetch if teamId is empty
      if (!teamId || teamId.trim() === '') {
        console.warn("useMeetings: teamId is empty, clearing meetings");
        setMeetings([]);
        return;
      }
      
      const fetchedMeetings = await getAllMeetingsForTeam(
        teamId,
        orderByField,
        orderDirection,
        statusFilter,
        userId
      );
      setMeetings(fetchedMeetings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch meetings');
      console.error('Error fetching meetings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Always call fetchMeetings, let it handle empty teamId
    fetchMeetings();
  }, [teamId, userId, orderByField, orderDirection, statusFilter]);

  const refetch = async () => {
    await fetchMeetings();
  };

  return {
    meetings,
    isLoading,
    error,
    refetch
  };
}; 