import { useState, useEffect } from "react";
import { useWorkspace, Workspace } from "@/lib/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { getUserTeams, getTeamById, Team } from "@/lib/db";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Plus, User, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const WorkspaceSwitcher = () => {
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      if (!currentUser) return;
      try {
        const userTeamsVal = await getUserTeams(currentUser.uid);
        if (userTeamsVal?.teams && userTeamsVal.teams.length > 0) {
          const teamDetails = await Promise.all(
            userTeamsVal.teams.map((id) => getTeamById(id))
          );
          setTeams(teamDetails.filter(Boolean) as Team[]);
        }
      } catch (err) {
        console.error("Failed to load user teams:", err);
      }
    };
    fetchTeams();
  }, [currentUser, isOpen]); // Refetch when opening to ensure freshness

  const handleSelect = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
    setIsOpen(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 pr-2 rounded-lg transition-colors outline-none w-full md:w-auto">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/40 dark:to-purple-900/40 overflow-hidden shrink-0">
          {activeWorkspace.type === "personal" ? (
            <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          ) : (
            <Avatar className="h-full w-full rounded-md">
              <AvatarFallback className="rounded-md bg-transparent text-slate-600 text-xs font-medium">
                {activeWorkspace.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="flex flex-col items-start min-w-[100px] text-left">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Workspace
          </span>
          <span className="text-sm font-semibold truncate max-w-[120px]">
            {activeWorkspace.name}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 ml-1" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 z-50">
        <DropdownMenuLabel className="text-xs text-slate-500 uppercase">
          Personal
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="flex items-center justify-between cursor-pointer py-2"
            onClick={() =>
              handleSelect({ type: "personal", id: null, name: "Personal" })
            }
          >
            <div className="flex items-center gap-2 font-medium">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 shrink-0">
                <User className="h-3 w-3" />
              </div>
              Personal
            </div>
            {activeWorkspace.type === "personal" && (
              <Check className="h-4 w-4 text-blue-500" />
            )}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {teams.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-slate-500 uppercase">
              Teams
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  className="flex items-center justify-between cursor-pointer py-2"
                  onClick={() =>
                    handleSelect({ type: "team", id: team.id, name: team.name })
                  }
                >
                  <div className="flex items-center gap-2 font-medium truncate">
                    <Avatar className="h-6 w-6 rounded">
                      <AvatarFallback className="text-[10px] rounded bg-purple-100 text-purple-700 font-bold">
                        {team.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{team.name}</span>
                  </div>
                  {activeWorkspace.type === "team" &&
                    activeWorkspace.id === team.id && (
                      <Check className="h-4 w-4 text-blue-500 shrink-0" />
                    )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          className="flex items-center gap-2 cursor-pointer text-blue-600 hover:text-blue-700 py-2"
          onClick={() => {
            setIsOpen(false);
            navigate("/team-setup");
          }}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </div>
          Create or join a team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceSwitcher;
