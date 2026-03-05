import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Users, FileText, MessageSquare, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { currentUser, isLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (currentUser && !isLoading) {
      navigate("/team");
    }
  }, [currentUser, isLoading, navigate]);

  // Navigation handler for auth/dashboard buttons
  const handleGetStarted = () => {
    if (currentUser) {
      navigate("/team");
    } else {
      navigate("/signup");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Navigation */}
      <nav className="px-6 py-4 flex justify-between items-center border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">HuddleAI</span>
        </div>
        <div className="flex items-center space-x-4">
          {currentUser ? (
            <Link to="/team">
              <Button variant="outline">Dashboard</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="outline">Log In</Button>
            </Link>
          )}
          <Button onClick={handleGetStarted}>
            {currentUser ? "Go to Dashboard" : "Get Started"}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 text-center max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Transform Your Daily Standups with{" "}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI-Powered Insights
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Upload your standup recordings and get instant transcriptions, summaries, action items, 
            and seamless integrations with your favorite tools like Jira and Slack.
          </p>
          <div className="flex justify-center space-x-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={handleGetStarted}
            >
              {currentUser ? "Go to Dashboard" : "Start Your Free Trial"}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Everything you need for better standups
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Auto Transcription</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Accurate speech-to-text conversion of your standup recordings with speaker identification.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-lg">Smart Summaries</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                AI-generated summaries highlighting key updates, blockers, and decisions made.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-lg">Action Items</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Automatically extract and organize action items with assignees and deadlines.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle className="text-lg">Team Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Centralized view of all team activities, meetings, and progress tracking.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to revolutionize your standups?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of teams already using HuddleAI to make their meetings more productive.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={handleGetStarted}
          >
            {currentUser ? "Go to Dashboard" : "Get Started Today"}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold">HuddleAI</span>
          </div>
          <p className="text-gray-400">
            © 2024 HuddleAI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
