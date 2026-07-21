import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Zap, Search, ArrowRight, LogIn } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [isNavigating, setIsNavigating] = useState(false);

  const features = [
    {
      icon: BookOpen,
      title: "RAG Agent",
      description: "Search and retrieve information from your company policies and documents with intelligent context understanding.",
      color: "bg-blue-50 border-blue-200",
      iconColor: "text-blue-600",
    },
    {
      icon: Zap,
      title: "Summarizer",
      description: "Automatically summarize long documents, emails, and reports into concise, actionable insights.",
      color: "bg-purple-50 border-purple-200",
      iconColor: "text-purple-600",
    },
    {
      icon: Search,
      title: "Web Search",
      description: "Search the web for real-time information with human-in-the-loop approval for sensitive queries.",
      color: "bg-green-50 border-green-200",
      iconColor: "text-green-600",
    },
  ];

  const handleStartChat = async () => {
    if (!user) {
      startLogin();
      return;
    }
    setIsNavigating(true);
    setLocation("/chat");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Productivity Agent</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-300">{user.name}</span>
                <Button
                  onClick={handleStartChat}
                  disabled={isNavigating}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isNavigating ? "Loading..." : "Start Chat"}
                </Button>
              </div>
            ) : (
              <Button
                onClick={startLogin}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Your Intelligent <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Workplace Assistant</span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
              Powered by advanced AI agents that understand your company's context, summarize information, and search the web—all with human oversight.
            </p>
            <Button
              onClick={handleStartChat}
              disabled={isNavigating || loading}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-6 text-lg flex items-center gap-2 mx-auto"
            >
              {isNavigating ? "Loading..." : "Start Using Now"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Decorative background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Powerful Capabilities</h2>
            <p className="text-lg text-slate-300">Three specialized agents working together to boost your productivity</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  className={`border ${feature.color} p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
                  onClick={handleStartChat}
                >
                  <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-700 mb-6">{feature.description}</p>
                  <div className="flex items-center gap-2 text-blue-600 font-medium">
                    Learn more
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-lg text-slate-300">A seamless workflow designed for modern teams</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Ask", description: "Type your question or request" },
              { step: "2", title: "Process", description: "AI agents analyze and route to specialists" },
              { step: "3", title: "Review", description: "Human-in-the-loop approval when needed" },
              { step: "4", title: "Deliver", description: "Get accurate, contextualized answers" },
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-lg">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to boost your productivity?</h2>
          <p className="text-xl text-blue-100 mb-8">Start chatting with your AI assistant today</p>
          <Button
            onClick={handleStartChat}
            disabled={isNavigating || loading}
            size="lg"
            className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-6 text-lg font-semibold"
          >
            {isNavigating ? "Loading..." : "Start Chat Now"}
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400">
          <p>&copy; 2026 Workplace Productivity Agent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
