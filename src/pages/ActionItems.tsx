import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  MessageSquare, ArrowLeft, Search, Plus, CheckCircle2, Clock, 
  User, Calendar, MoreVertical, Edit3, Trash2, AlertCircle, 
  Filter, Play, Calendar as CalendarIcon, Users, Loader2, FileText
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActionItems, ExtendedActionItem } from "@/hooks/useActionItems";
import { getUserTeams, getTeamById, Team as TeamType, getTeamMembers, TeamMember, getAllMeetingsForTeam, Meeting } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ActionItems = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in-progress" | "completed" | "overdue">("all");
  const [currentTeam, setCurrentTeam] = useState<TeamType | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMeetings, setTeamMeetings] = useState<Meeting[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExtendedActionItem | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    description: "",
    assignedTo: "",
    assignedToName: "",
    dueDate: "",
    status: "pending" as "pending" | "in-progress" | "completed",
    meetingId: ""
  });
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  
  // Load current team
  useEffect(() => {
    const loadCurrentTeam = async () => {
      if (!currentUser) {
        navigate("/login");
        return;
      }
      
      try {
        setIsLoadingTeam(true);
        const userTeams = await getUserTeams(currentUser.uid);
        
        if (!userTeams.currentTeam) {
          navigate("/team-setup");
          return;
        }
        
        const team = await getTeamById(userTeams.currentTeam);
        if (team) {
          setCurrentTeam(team);
          
          // Load team members for assignment dropdown
          const members = await getTeamMembers(team.id);
          setTeamMembers(members);
          
          // Load team meetings for meeting selection
          const meetings = await getAllMeetingsForTeam(team.id, 'date', 'desc');
          setTeamMeetings(meetings);
        } else {
          toast({
            variant: "destructive",
            title: "Team not found",
            description: "We couldn't find your team. Please create or join a team."
          });
          navigate("/team-setup");
        }
      } catch (error) {
        console.error("Error loading team:", error);
        toast({
          variant: "destructive",
          title: "Error loading team",
          description: "There was a problem accessing your team information."
        });
      } finally {
        setIsLoadingTeam(false);
      }
    };
    
    loadCurrentTeam();
  }, [currentUser, navigate, toast]);

  // Use the action items hook
  const { 
    actionItems, 
    isLoading: isLoadingActionItems, 
    error: actionItemsError,
    refetch,
    createItem,
    updateItem,
    updateStatus,
    deleteItem,
    stats
  } = useActionItems({
    teamId: currentTeam?.id || "",
    userId: currentUser?.uid,
    autoRefresh: true
  });

  // Filter action items
  const filteredActionItems = actionItems.filter(item => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.assignedToName && item.assignedToName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (item.meetingTitle && item.meetingTitle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    let matchesStatus = true;
    if (statusFilter !== "all") {
      if (statusFilter === "overdue") {
        const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'completed';
        matchesStatus = isOverdue;
      } else {
        matchesStatus = item.status === statusFilter;
      }
    }
    
    return matchesSearch && matchesStatus;
  });

  const resetForm = () => {
    setFormData({
      description: "",
      assignedTo: "",
      assignedToName: "",
      dueDate: "",
      status: "pending",
      meetingId: ""
    });
  };

  const handleCreateSubmit = async () => {
    try {
      if (!formData.description.trim()) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please enter a description for the action item."
        });
        return;
      }

      if (!formData.meetingId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please select a meeting for this action item."
        });
        return;
      }

      await createItem({
        description: formData.description,
        assignedTo: formData.assignedTo || undefined,
        assignedToName: formData.assignedToName || undefined,
        dueDate: formData.dueDate || undefined,
        status: formData.status,
        meetingId: formData.meetingId
      });

      toast({
        title: "Action item created",
        description: "The action item has been successfully created."
      });

      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error creating action item",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    }
  };

  const handleEditSubmit = async () => {
    try {
      if (!editingItem) return;

      if (!formData.description.trim()) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please enter a description for the action item."
        });
        return;
      }

      await updateItem(editingItem.id, editingItem.meetingId!, {
        description: formData.description,
        assignedTo: formData.assignedTo || undefined,
        assignedToName: formData.assignedToName || undefined,
        dueDate: formData.dueDate || undefined,
        status: formData.status
      });

      toast({
        title: "Action item updated",
        description: "The action item has been successfully updated."
      });

      setIsEditDialogOpen(false);
      setEditingItem(null);
      resetForm();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error updating action item",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    }
  };

  const handleEdit = (item: ExtendedActionItem) => {
    setEditingItem(item);
    setFormData({
      description: item.description,
      assignedTo: item.assignedTo || "",
      assignedToName: item.assignedToName || "",
      dueDate: item.dueDate || "",
      status: item.status,
      meetingId: item.meetingId || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (item: ExtendedActionItem) => {
    try {
      if (!item.meetingId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Cannot delete action item: missing meeting information."
        });
        return;
      }

      await deleteItem(item.id, item.meetingId);
      toast({
        title: "Action item deleted",
        description: "The action item has been successfully deleted."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error deleting action item",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    }
  };

  const handleStatusChange = async (item: ExtendedActionItem, newStatus: "pending" | "in-progress" | "completed") => {
    try {
      if (!item.meetingId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Cannot update action item: missing meeting information."
        });
        return;
      }

      await updateStatus(item.id, item.meetingId, newStatus);
      toast({
        title: "Status updated",
        description: `Action item marked as ${newStatus.replace('-', ' ')}.`
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error updating status",
        description: error instanceof Error ? error.message : "An error occurred"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "in-progress": return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case "pending": return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getOverdueBadge = (item: ExtendedActionItem) => {
    if (!item.dueDate || item.status === 'completed') return null;
    
    const isOverdue = new Date(item.dueDate) < new Date();
    if (isOverdue) {
      return <Badge variant="destructive" className="ml-2">Overdue</Badge>;
    }
    return null;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "Unknown date";
    
    let date: Date;
    
    try {
      // Handle Firestore Timestamp
      if (timestamp && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      }
      // Handle JavaScript Date object
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Handle string timestamps
      else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      }
      // Handle numeric timestamps (milliseconds)
      else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      }
      // Handle objects with seconds property (Firestore serverTimestamp format)
      else if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      }
      // Fallback
      else {
        console.warn('Unknown timestamp format:', timestamp, typeof timestamp);
        return "Invalid date";
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date created from timestamp:', timestamp);
        return "Invalid date";
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting timestamp:', timestamp, error);
      return "Invalid date";
    }
  };

  // Loading state
  if (isLoadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg p-8">
          <div className="flex items-center space-x-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Loading team...</h3>
              <p className="text-sm text-gray-600">Please wait while we load your team information.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (actionItemsError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
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
              Back
            </Button>
          </Link>
        </nav>
        
        <div className="px-6 py-8 max-w-7xl mx-auto">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-8 pb-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading action items</h3>
              <p className="text-gray-600 mb-4">{actionItemsError}</p>
              <Button onClick={() => refetch()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <Link to="/team" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">HuddleAI</span>
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          {/* Create Action Item Dialog */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Create Action Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Create New Action Item</DialogTitle>
                <DialogDescription>
                  Add a new action item for your team to track and complete.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Enter action item description..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="min-h-[80px]"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="meetingId">Meeting</Label>
                  <Select 
                    value={formData.meetingId} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, meetingId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select meeting" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMeetings.map((meeting) => (
                        <SelectItem key={meeting.id} value={meeting.id}>
                          <div className="flex items-center space-x-2">
                            <span>{meeting.title}</span>
                            <span className="text-xs text-gray-500">
                              {formatTimestamp(meeting.date)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="assignedTo">Assign to</Label>
                    <Select 
                      value={formData.assignedTo} 
                      onValueChange={(value) => {
                        const member = teamMembers.find(m => m.uid === value);
                        setFormData(prev => ({ 
                          ...prev, 
                          assignedTo: value,
                          assignedToName: member?.displayName || ""
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.uid} value={member.uid}>
                            {member.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select 
                      value={formData.status} 
                      onValueChange={(value: "pending" | "in-progress" | "completed") => 
                        setFormData(prev => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dueDate">Due Date (Optional)</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSubmit}>
                  Create Action Item
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Link to="/team">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>
      </nav>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Action Items</h1>
          <p className="text-gray-600">
            Manage and track action items for {currentTeam?.name || "your team"}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              {isLoadingActionItems ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold">{stats.total}</div>
              )}
              <p className="text-sm text-gray-600">Total</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              {isLoadingActionItems ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              )}
              <p className="text-sm text-gray-600">Pending</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              {isLoadingActionItems ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
              )}
              <p className="text-sm text-gray-600">In Progress</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              {isLoadingActionItems ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              )}
              <p className="text-sm text-gray-600">Completed</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 pb-4">
              {isLoadingActionItems ? (
                <div className="text-2xl font-bold animate-pulse bg-gray-200 h-8 w-12 rounded"></div>
              ) : (
                <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              )}
              <p className="text-sm text-gray-600">Overdue</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6 border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search action items, assignees, or meetings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant={statusFilter === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </Button>
                <Button 
                  variant={statusFilter === "pending" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                >
                  Pending
                </Button>
                <Button 
                  variant={statusFilter === "in-progress" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("in-progress")}
                >
                  In Progress
                </Button>
                <Button 
                  variant={statusFilter === "completed" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("completed")}
                >
                  Completed
                </Button>
                <Button 
                  variant={statusFilter === "overdue" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("overdue")}
                >
                  Overdue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredActionItems.length} of {actionItems.length} action items
          </p>
          {isLoadingActionItems && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading action items...</span>
            </div>
          )}
        </div>

        {/* Action Items List */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            {filteredActionItems.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {filteredActionItems.map((item) => (
                  <div key={`${item.id}-${item.meetingId}`} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getStatusBadge(item.status)}
                          {getOverdueBadge(item)}
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          {item.description}
                        </h3>
                        <div className="flex items-center space-x-6 text-sm text-gray-600">
                          {item.meetingTitle && (
                            <Link 
                              to={`/meeting-details?id=${item.meetingId}`}
                              className="flex items-center hover:text-blue-600 transition-colors"
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              {item.meetingTitle}
                            </Link>
                          )}
                          {item.assignedToName && (
                            <span className="flex items-center">
                              <User className="w-4 h-4 mr-1" />
                              {item.assignedToName}
                            </span>
                          )}
                          {item.dueDate && (
                            <span className="flex items-center">
                              <CalendarIcon className="w-4 h-4 mr-1" />
                              Due {formatDate(item.dueDate)}
                            </span>
                          )}
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            Created {formatTimestamp(item.createdAt)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Actions Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(item)}>
                            <Edit3 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {item.status !== 'pending' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(item, 'pending')}>
                              <Clock className="w-4 h-4 mr-2" />
                              Mark as Pending
                            </DropdownMenuItem>
                          )}
                          {item.status !== 'in-progress' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(item, 'in-progress')}>
                              <Play className="w-4 h-4 mr-2" />
                              Mark as In Progress
                            </DropdownMenuItem>
                          )}
                          {item.status !== 'completed' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(item, 'completed')}>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Mark as Completed
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDelete(item)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {actionItems.length === 0 ? "No action items yet" : "No matching action items"}
                </h3>
                <p className="text-gray-600 mb-4">
                  {actionItems.length === 0 
                    ? teamMeetings.length === 0 
                      ? "Upload some meetings first, then create action items to track progress"
                      : "Get started by creating your first action item" 
                    : "Try adjusting your search or filter criteria"
                  }
                </p>
                {actionItems.length === 0 && teamMeetings.length > 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Action Item
                  </Button>
                )}
                {teamMeetings.length === 0 && (
                  <Link to="/meeting-upload">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Upload Meeting
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Action Item Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Edit Action Item</DialogTitle>
              <DialogDescription>
                Update the action item details below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Enter action item description..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="min-h-[80px]"
                />
              </div>
              
              {editingItem && (
                <div className="grid gap-2">
                  <Label>Meeting</Label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      {editingItem.meetingTitle || "Unknown Meeting"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Meeting cannot be changed after creation
                    </p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-assignedTo">Assign to</Label>
                  <Select 
                    value={formData.assignedTo} 
                    onValueChange={(value) => {
                      const member = teamMembers.find(m => m.uid === value);
                      setFormData(prev => ({ 
                        ...prev, 
                        assignedTo: value,
                        assignedToName: member?.displayName || ""
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.uid} value={member.uid}>
                          {member.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value: "pending" | "in-progress" | "completed") => 
                      setFormData(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-dueDate">Due Date (Optional)</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditSubmit}>
                Update Action Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ActionItems; 