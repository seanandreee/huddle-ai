import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Users, ArrowRight, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { setOnboardingComplete } from "@/lib/db";

/**
 * Sprint 2B — OnboardingFork
 *
 * Shown exactly once to new organic users after signup.
 * Gate: onboardingComplete flag in Firestore (set by this page on choice).
 *
 * "Just me"      → setOnboardingComplete → /team (SOLO_EMPTY dashboard)
 * "With a team"  → /team-setup (create/join flow sets flag on completion)
 *
 * Invited users skip this page entirely (handled in Signup.tsx route guard).
 */
const OnboardingFork = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState<"solo" | "team" | null>(null);

  const handleSolo = async () => {
    if (!currentUser) return;
    setIsLoading("solo");
    try {
      await setOnboardingComplete(currentUser.uid);
      navigate("/team");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "Please try again.",
      });
      setIsLoading(null);
    }
  };

  const handleTeam = () => {
    // Team setup page will call setOnboardingComplete on completion
    setIsLoading("team");
    navigate("/team-setup");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12 relative z-10">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-white tracking-tight">HuddleAI</span>
      </div>

      {/* Headline */}
      <div className="text-center mb-10 relative z-10 max-w-lg">
        <h1 className="text-4xl font-bold text-white mb-3 leading-tight">
          How will you use HuddleAI?
        </h1>
        <p className="text-slate-400 text-lg">
          We'll set up your workspace based on how you work.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl relative z-10">
        {/* Just me */}
        <button
          id="onboarding-solo"
          onClick={handleSolo}
          disabled={isLoading !== null}
          className={`
            group relative p-7 rounded-2xl border text-left cursor-pointer transition-all duration-200
            bg-white/5 border-white/10 hover:bg-white/10 hover:border-purple-400/50
            hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5
            disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent
          `}
        >
          {/* Icon */}
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center mb-5 group-hover:from-blue-500/30 group-hover:to-blue-600/30 transition-all">
            <User className="w-6 h-6 text-blue-400" />
          </div>

          <h2 className="text-lg font-semibold text-white mb-1.5">Just me</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-5">
            Upload meetings for yourself. Get AI summaries and action items instantly. No team required.
          </p>

          {/* Feature list */}
          <ul className="space-y-1.5 mb-6">
            {["Personal meeting library", "AI summaries & action items", "Upgrade to team anytime"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5 text-blue-400 text-sm font-medium group-hover:gap-2.5 transition-all">
            {isLoading === "solo" ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                Setting up...
              </span>
            ) : (
              <>Start solo <ArrowRight className="w-4 h-4" /></>
            )}
          </div>
        </button>

        {/* With a team */}
        <button
          id="onboarding-team"
          onClick={handleTeam}
          disabled={isLoading !== null}
          className={`
            group relative p-7 rounded-2xl border text-left cursor-pointer transition-all duration-200
            bg-gradient-to-br from-purple-600/10 to-blue-600/10 border-purple-500/30
            hover:from-purple-600/20 hover:to-blue-600/20 hover:border-purple-400/60
            hover:shadow-xl hover:shadow-purple-500/15 hover:-translate-y-0.5
            disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent
          `}
        >
          {/* Recommended badge */}
          <div className="absolute top-4 right-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            Popular
          </div>

          {/* Icon */}
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 rounded-xl flex items-center justify-center mb-5 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all">
            <Users className="w-6 h-6 text-purple-400" />
          </div>

          <h2 className="text-lg font-semibold text-white mb-1.5">With a team</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-5">
            Share meetings with your team. Collaborative summaries, shared action items, and Slack integration.
          </p>

          {/* Feature list */}
          <ul className="space-y-1.5 mb-6">
            {["Shared meeting workspace", "Team action items", "Slack notifications"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5 text-purple-400 text-sm font-medium group-hover:gap-2.5 transition-all">
            {isLoading === "team" ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                Loading...
              </span>
            ) : (
              <>Set up team <ArrowRight className="w-4 h-4" /></>
            )}
          </div>
        </button>
      </div>

      {/* Footer note */}
      <p className="text-slate-600 text-xs mt-8 text-center relative z-10 max-w-sm">
        You can always switch between personal and team workspaces later from the nav.
      </p>
    </div>
  );
};

export default OnboardingFork;
