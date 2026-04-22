import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type WorkspaceType = "personal" | "team";

export interface Workspace {
  type: WorkspaceType;
  id: string | null;  // null if personal
  name: string;
}

interface WorkspaceContextType {
  activeWorkspace: Workspace;
  setActiveWorkspace: (workspace: Workspace) => void;
  // Expose an initializer to reset workspace if user changes
  initializeWorkspace: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};

interface WorkspaceProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = "huddleai_active_workspace";

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  
  // Initialize from localStorage or default to personal
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to parse stored workspace:", e);
    }
    return { type: "personal", id: null, name: "Personal" };
  });

  const setActiveWorkspace = (workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch (e) {
      console.error("Failed to save workspace to localStorage:", e);
    }
  };

  const initializeWorkspace = () => {
    setActiveWorkspace({ type: "personal", id: null, name: "Personal" });
  };

  // If the user logs out, we should probably reset it, or at least it defaults to personal 
  // on next login if they don't have teams. For now keep simple:
  useEffect(() => {
    if (!currentUser) {
      // Clear or reset when logged out
      localStorage.removeItem(STORAGE_KEY);
      setActiveWorkspaceState({ type: "personal", id: null, name: "Personal" });
    }
  }, [currentUser]);

  return (
    <WorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace, initializeWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
