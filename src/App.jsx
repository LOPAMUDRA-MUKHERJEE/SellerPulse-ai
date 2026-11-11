import { useState, useRef, useEffect } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Mic,
  Package,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  VolumeX,
  X
} from "lucide-react";

import { sellerData } from "./data/sellerData";
import "./App.css";
import { generateLocalDemoReply } from "./data/localDemo";

const PROVIDER_LABELS = {
  groq: "Groq · GPT OSS 120B",
  gemini: "Gemini 2.5 Flash",
  local: "Local demo"
};
const providerLabel = (p) => PROVIDER_LABELS[p] || "AI";

const initialMessage = {
  id: 1,
  role: "assistant",
  text: "Hello Aarav! I'm your virtual Key Account Manager. I can help you understand your store's performance and identify opportunities to improve your sales. What would you like help with today?"
};

function MetricCard({
  title,
  value,
  previous,
  icon: Icon,
  suffix = "",
  prefix = "",
  changeLabel,
  changeDirection = "down"
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <div className="metric-icon">
          <Icon size={18} />
        </div>
      </div>

      <div className="metric-value">
        {prefix}{value.toLocaleString("en-IN")}{suffix}
      </div>

      <div className="metric-bottom">
        <span className="negative">
          {changeDirection === "down" ? (
            <ArrowDownRight size={14} />
          ) : (
            <ArrowUpRight size={14} />
          )}
          {changeLabel}
        </span>
        <span className="muted">vs last month</span>
      </div>

      <div className="metric-previous">
        Previous: {prefix}{previous.toLocaleString("en-IN")}{suffix}
      </div>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState("");
  const [completed, setCompleted] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState("");
  const [responseMode, setResponseMode] = useState("ai");
  const [activeSection, setActiveSection] = useState("overview");
  const [summaryVisible, setSummaryVisible] = useState(false);

  const recognitionRef = useRef(null);
  const transcriptEndRef = useRef(null);

  const handsFreeRef = useRef(false);
  const startListeningRef = useRef(null);
  const [handsFree, setHandsFree] = useState(false);
  const [liveCaption, setLiveCaption] = useState("");
  const finalBufferRef = useRef("");
  const interimRef = useRef("");
  const silenceTimerRef = useRef(null);

  // Keep the newest conversation message visible.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, isLoading]);

  // Close the mobile navigation when Escape is pressed.
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Track which dashboard section is currently visible.
  useEffect(() => {
    const sectionIds = [
      "overview",
      "assistant",
      "insights",
      "recommendations"
    ];

    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!("IntersectionObserver" in window) || sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: "-18% 0px -62% 0px",
        threshold: [0, 0.15, 0.35, 0.6]
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Navigate to a dashboard section.
  const navigateToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    setActiveSection(sectionId);
    setIsSidebarOpen(false);
  };


  const speakResponse = (rawText) => {
  const text = rawText.replace(/[*_#]/g, "").replace(/\u2011/g, "-");
  if (!("speechSynthesis" in window)) {
    setVoiceError("Speech output is not supported by this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();

  const preferred =
    voices.find((v) => /neerja|heera|ravi/i.test(v.name)) ||
    voices.find((v) => v.lang === "en-IN") ||
    voices.find((v) => v.lang.startsWith("en"));

  if (preferred) utterance.voice = preferred;
  utterance.lang = preferred?.lang || "en-IN";
  utterance.rate = 1.05;
  utterance.pitch = 1;

  utterance.onstart = () => setIsSpeaking(true);

  utterance.onend = () => {
    setIsSpeaking(false);
    // Hands-free: start listening again once the bot finishes talking.
    if (handsFreeRef.current) {
      setTimeout(() => startListeningRef.current?.(), 400);
    }
  };

  utterance.onerror = () => setIsSpeaking(false);

  window.speechSynthesis.speak(utterance);
};

  // Stop the assistant's speech output.
  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
  };

  const requestAIResponse = async (
    conversationMessages,
    requestedMode = responseMode
  ) => {
    setIsLoading(true);
    setLastFailedMessage("");

    const cleanMessages = conversationMessages.filter(
      (message) => !message.isError
    );

    const conversationHistory = cleanMessages.map((message) => ({
      role: message.role === "seller" ? "user" : "assistant",
      content: message.text
    }));

    // Local Demo: handle the conversation without calling Gemini.
    if (requestedMode === "local") {
      try {
        const fallbackReply = generateLocalDemoReply(cleanMessages);

        setResponseMode("local");

        setMessages((previous) => [
          ...previous.filter((message) => !message.isError),
          {
            id: Date.now() + 1,
            role: "assistant",
            text: fallbackReply,
            source: "local"
          }
        ]);

        speakResponse(fallbackReply);
      } catch (error) {
        console.error("Local demo error:", error);

        setMessages((previous) => [
          ...previous.filter((message) => !message.isError),
          {
            id: Date.now() + 1,
            role: "assistant",
            text: "The local demo could not generate a response. Please try sending your message again.",
            isError: true
          }
        ]);
      } finally {
        setIsLoading(false);
      }

      return;
    }

    // Gemini mode.
    try {
      const controller = new AbortController();

      const timeoutId = window.setTimeout(() => controller.abort(), 32000);

      let response;

      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: conversationHistory
          }),
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(
          data.error || `Request failed (HTTP ${response.status}).`
        );

        error.status = response.status;
        throw error;
      }

      if (!data.reply || typeof data.reply !== "string") {
        throw new Error("The AI returned an empty response.");
      }

            const provider =
        typeof data.provider === "string" ? data.provider : "ai";

      setResponseMode(provider);

      setMessages((previous) => [
        ...previous.filter((message) => !message.isError),
        {
          id: Date.now() + 1,
          role: "assistant",
          text: data.reply,
          source: provider
        }
      ]);

      speakResponse(data.reply);
    } catch (error) {
      console.warn("AI request failed:", {
        status: error.status,
        message: error.message
      });

      const userMessage =
        error.name === "AbortError"
          ? "AI is taking too long to respond. You can retry the request or continue with the Local Demo."
          : `${error.message} You can retry or continue with the Local Demo.`;

      const failedSellerMessage = [...cleanMessages]
        .reverse()
        .find((message) => message.role === "seller");

      setLastFailedMessage(failedSellerMessage?.text || "");

      setMessages((previous) => [
        ...previous.filter((message) => !message.isError),
        {
          id: Date.now() + 1,
          role: "assistant",
          text: userMessage,
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Reusable message function for both typed and spoken input.
  const sendMessage = async (text) => {
    const value = text.trim();

    if (!value || isLoading) return;

    stopSpeaking();
    setVoiceError("");
    setLastFailedMessage("");

    // Remove an old error bubble when the seller starts a new message.
    const cleanMessages = messages.filter((message) => !message.isError);

    const sellerMessage = {
      id: Date.now(),
      role: "seller",
      text: value
    };

    const updatedMessages = [...cleanMessages, sellerMessage];

    setMessages(updatedMessages);
    setInput("");

    await requestAIResponse(updatedMessages);
  };

  // Retry the last failed request without adding a duplicate seller message.
  const retryLastMessage = async () => {
    if (!lastFailedMessage || isLoading) return;

    const cleanMessages = messages.filter((message) => !message.isError);

    setMessages(cleanMessages);
    setVoiceError("");

    await requestAIResponse(cleanMessages, "ai");
  };

  // Continue the same conversation using the local rule-based engine.
  const continueWithLocalDemo = async () => {
    if (!lastFailedMessage || isLoading) return;

    const cleanMessages = messages.filter((message) => !message.isError);

    setMessages(cleanMessages);
    setVoiceError("");

    await requestAIResponse(cleanMessages, "local");
  };


  const handleSend = () => {
    sendMessage(input);
  };

  // Start speech recognition.
  const startListening = () => {
    if (isLoading || isListening || isSpeaking) return;

    setVoiceError("");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setVoiceError(
        "Voice recognition is not supported in this browser. Please use Chrome or type your message."
      );
      return;
    }

    if (!("speechSynthesis" in window)) {
      setVoiceError(
        "Speech output is unavailable. You can still use text input."
      );
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onstart = () => {
      setIsListening(true);
    };


  recognition.onresult = (event) => {
  let interim = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const t = event.results[i][0].transcript;
    if (event.results[i].isFinal) finalBufferRef.current += " " + t;
    else interim += t;
  }
  interimRef.current = interim;
  const full = (finalBufferRef.current + " " + interim).trim();
  setLiveCaption(full);

  // Wait for 1.8s of real silence before treating the turn as finished
  clearTimeout(silenceTimerRef.current);
  silenceTimerRef.current = setTimeout(() => {
    const text = full.trim();
    finalBufferRef.current = "";
    interimRef.current = "";
    if (!text) return;
    try { recognitionRef.current?.stop(); } catch {}
    setLiveCaption("");
    sendMessage(text);
  }, 1800);
};

  recognition.onerror = (event) => {
            if (event.error === "aborted") {
        setIsListening(false);
        return;
      }
      const errors = {
        "not-allowed":
          "Microphone permission denied. Please allow microphone access in Chrome.",
        "service-not-allowed": "Speech recognition service is unavailable.",
        "no-speech": "No speech detected. Please try again.",
        "audio-capture":
          "No microphone was detected. Check your microphone connection.",
        network: "Speech recognition network error. Please try again."
      };

      setVoiceError(
        errors[event.error] || "Something went wrong with voice recognition."
      );

      setIsListening(false);

      // Add the new line for hands-free loop here:
      if (event.error === "no-speech" && handsFreeRef.current) {
        setTimeout(() => startListeningRef.current?.(), 300);
      }
    };

  recognition.onend = () => {
  setIsListening(false);
  recognitionRef.current = null;
  setLiveCaption("");

  // If Chrome ended the session before our timer fired, send what we have
  const pending = (finalBufferRef.current + " " + interimRef.current).trim();
  if (pending) {
    clearTimeout(silenceTimerRef.current);
    finalBufferRef.current = "";
    interimRef.current = "";
    sendMessage(pending);
  }
};


    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      setIsListening(false);
      recognitionRef.current = null;
      setVoiceError("Unable to start your microphone. Please try again.");
    }
  };

  startListeningRef.current = startListening;

// const toggleHandsFree = () => {
//   const next = !handsFreeRef.current;
//   handsFreeRef.current = next;
//   setHandsFree(next);

//   if (next) {
//     startListening();
//   } else {
//     stopSpeaking();
//     recognitionRef.current?.abort();
//   }
// };

  // Stop speech recognition.
  
  const toggleHandsFree = () => {
  const next = !handsFreeRef.current;
  handsFreeRef.current = next;
  setHandsFree(next);

  if (next) {
    // Greet first. speakResponse's onend starts the mic automatically.
    speakResponse(initialMessage.text);
  } else {
    stopSpeaking();
    recognitionRef.current?.abort();
  }
};

const handleMicClick = () => {
  if (isListening) {
    stopListening();
    return;
  }
  const sellerSpoke = messages.some((m) => m.role === "seller");
  if (!handsFreeRef.current && !sellerSpoke) {
    toggleHandsFree(); // greets first, then opens the mic
    return;
  }
  startListening();
};
  
  
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.warn("Speech recognition could not be stopped:", error);
      }

      recognitionRef.current = null;
    }

    setIsListening(false);
  };

  // Clean up browser speech APIs when the component unmounts.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleTask = (id) => {
    setCompleted((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const metrics = sellerData.metrics;

  const sellerResponses = messages
    .filter((message) => message.role === "seller")
    .map((message) => message.text.trim())
    .filter(Boolean);


const assistantStatus = isListening
  ? "Listening"
  : isSpeaking
    ? "Speaking"
    : isLoading
      ? "Thinking"
      : lastFailedMessage
        ? "AI unavailable"
        : responseMode === "local"
          ? "Local demo mode"
          : providerLabel(responseMode);


  return (
    <div className="app-shell">
      {/* MOBILE SIDEBAR BACKDROP */}
      {isSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`sidebar ${isSidebarOpen ? "sidebar-open" : ""}`}
        id="app-sidebar"
        aria-label="Main navigation"
      >
        <div className="brand">
          <div className="brand-icon">
            <Activity size={23} />
          </div>

          <div>
            <h2>
              SellerPulse<span>AI</span>
            </h2>
            <p>SELLER INTELLIGENCE</p>
          </div>

          <button
            type="button"
            className="sidebar-close-button"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Dashboard sections">
          <button
            type="button"
            className={`nav-item ${activeSection === "overview" ? "active" : ""}`}
            onClick={() => navigateToSection("overview")}
            aria-current={activeSection === "overview" ? "location" : undefined}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeSection === "assistant" ? "active" : ""}`}
            onClick={() => navigateToSection("assistant")}
            aria-current={activeSection === "assistant" ? "location" : undefined}
          >
            <MessageSquare size={18} />
            <span>AI Assistant</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeSection === "insights" ? "active" : ""}`}
            onClick={() => navigateToSection("insights")}
            aria-current={activeSection === "insights" ? "location" : undefined}
          >
            <BarChart3 size={18} />
            <span>Business Insights</span>
          </button>

          <button
            type="button"
            className={`nav-item ${
              activeSection === "recommendations" ? "active" : ""
            }`}
            onClick={() => navigateToSection("recommendations")}
            aria-current={
              activeSection === "recommendations" ? "location" : undefined
            }
          >
            <ShoppingBag size={18} />
            <span>Recommendations</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">AS</div>

            <div className="profile-info">
              <strong>{sellerData.sellerName}</strong>
              <span>Seller Account</span>
            </div>

            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-heading">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation"
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
            >
              <Menu size={21} />
            </button>

            <div>
              <div className="breadcrumb">Workspace / Overview</div>
              <h1>Seller Overview</h1>
            </div>
          </div>

          <div className="topbar-right">
            <div className="live-status">
              <span className="status-dot"></span>
              Demo environment
            </div>

            <div className="topbar-date">
              <Clock3 size={15} />
              November 2026
            </div>
          </div>
        </header>

        <section className="welcome-section" id="overview">
          <div>
            <div className="eyebrow">
              <Sparkles size={14} />
              YOUR BUSINESS AT A GLANCE
            </div>

            <h2>Good evening, Aarav.</h2>

            <p>
              Here's what's happening with your store. Let's find opportunities
              to improve your performance.
            </p>
          </div>

          <div className="welcome-icon">
            <Activity size={38} />
          </div>
        </section>

        {/* PERFORMANCE METRICS */}
        <section className="section" id="insights">
          <div className="section-heading">
            <div>
              <h3>Performance snapshot</h3>
              <p>Current month compared with previous month</p>
            </div>

            <span className="period-tag">MONTHLY REPORT</span>
          </div>

          <div className="metrics-grid">
            <MetricCard
              title="Total sales"
              value={metrics.sales.current}
              previous={metrics.sales.previous}
              changeLabel={`${Math.abs(metrics.sales.change)}%`}
              changeDirection="down"
              icon={BarChart3}
              prefix="₹"
            />

            <MetricCard
              title="Total orders"
              value={metrics.orders.current}
              previous={metrics.orders.previous}
              changeLabel={`${Math.abs(metrics.orders.change)}%`}
              changeDirection="down"
              icon={ShoppingBag}
            />

            <MetricCard
              title="Cancellation rate"
              value={metrics.cancellationRate.current}
              previous={metrics.cancellationRate.previous}
              changeLabel={`+${
                metrics.cancellationRate.current -
                metrics.cancellationRate.previous
              } percentage points`}
              changeDirection="up"
              icon={TrendingDown}
              suffix="%"
            />

            <MetricCard
              title="Out-of-stock products"
              value={metrics.outOfStock.current}
              previous={metrics.outOfStock.previous}
              changeLabel={`+${Math.round(
                ((metrics.outOfStock.current - metrics.outOfStock.previous) /
                  metrics.outOfStock.previous) *
                  100
              )}%`}
              changeDirection="up"
              icon={Package}
            />
          </div>
        </section>

        {/* WORKSPACE GRID */}
        <section className="workspace-grid">
          {/* AI CONVERSATION */}
          <div className="panel conversation-panel" id="assistant">
            <div className="panel-header">
              <div className="panel-title">
                <div className="ai-icon">
                  <Bot size={21} />
                </div>

                <div>
                  <h3>Your AI Key Account Manager</h3>
                  <p>SellerPulse intelligent assistant</p>
                </div>
              </div>

              <div
                className={`online-status ${
                  lastFailedMessage ? "status-error" : ""
                }`}
              >
                <span className="status-dot"></span>
                {assistantStatus}
              </div>
            </div>

            <div className="conversation-intro">
              <div className="assistant-avatar">
                <Bot size={26} />
              </div>

              <h3>How can I help your business today?</h3>

              <p>
                Talk to your AI account manager about sales, inventory,
                cancellations or business growth.
              </p>
            </div>
            
            <div className={`voice-area ${isListening ? "listening" : ""}`}>

              {/* FIXED: Added type and className here so the CSS applies */}
              <button 
                type="button" 
                className={`hands-free-button ${handsFree ? "active" : ""}`}
                onClick={toggleHandsFree}
              >
                {handsFree ? "End call" : "Start call"}
              </button>
              {liveCaption && <p className="live-caption">{liveCaption}</p>}
              
              <button
                type="button"
                className={`voice-mic-button ${isListening ? "active" : ""}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isLoading || isSpeaking}
                aria-label={
                  isListening ? "Stop listening" : "Start voice interaction"
                }
              >
                <div className="voice-ring">
                  <div className="voice-inner">
                    <Mic size={30} />
                  </div>
                </div>
              </button>

              <p className="voice-label">
                {isListening
                  ? "Listening... Speak now"
                  : isSpeaking
                    ? "Your AI assistant is speaking..."
                    : isLoading
                      ? "Analysing your request..."
                      : "Talk to your AI account manager"}
              </p>

              <span className="voice-subtitle">
                {isListening
                  ? "Your microphone is active. Speak clearly."
                  : isSpeaking
                    ? "Your response is being read aloud."
                    : "Click the microphone and your assistant will greet you first."}
              </span>

              {isSpeaking && (
                <button
                  type="button"
                  className="stop-speaking-button"
                  onClick={stopSpeaking}
                >
                  <VolumeX size={14} />
                  Stop speaking
                </button>
              )}

              {voiceError && (
                <p className="voice-error" role="alert">
                  {voiceError}
                </p>
              )}

              {!speechSupported && (
                <p className="voice-fallback">
                  Text input is available below.
                </p>
              )}
            </div>

            {/* CONVERSATION TRANSCRIPT */}
            <div className="transcript">
              <div className="transcript-heading">
                <span>CONVERSATION</span>
                <span>{messages.length} messages</span>
              </div>

              <div className="message-list" aria-live="polite">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.role} ${
                      message.isError ? "message-error" : ""
                    }`}
                  >
                    <div className="message-avatar">
                      {message.role === "assistant" ? (
                        <Bot size={15} />
                      ) : (
                        "AS"
                      )}
                    </div>

                    <div className="message-content">
                      <span>
                        {message.isError
                          ? "Connection issue"
                          : message.role === "assistant"
                            ? `SellerPulse AI${
                                message.source ? ` · ${providerLabel(message.source)}` : ""
                              }`
                            : "You"}
                      </span>

                      <p>{message.text}</p>

                      {message.isError && lastFailedMessage && (
                        <div className="gemini-failure-actions">
                          <button
                            type="button"
                            className="retry-button"
                            onClick={retryLastMessage}
                            disabled={isLoading}
                          >
                            <Activity size={14} />
                            Retry 
                          </button>

                          <button
                            type="button"
                            className="local-demo-button"
                            onClick={continueWithLocalDemo}
                            disabled={isLoading}
                          >
                            <Bot size={14} />
                            Continue with Local Demo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="message assistant">
                    <div className="message-avatar">
                      <Bot size={15} />
                    </div>

                    <div className="message-content">
                      <span>SellerPulse AI</span>
                      <p>Analysing your business performance...</p>
                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* TEXT INPUT */}
            <div className="chat-input-area">
              <input
                type="text"
                disabled={isLoading}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSend();
                  }
                }}
                placeholder="Type a message to test the interface..."
                aria-label="Type your message"
              />

              <button
                type="button"
                className="send-button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                {isLoading ? (
                  <span className="loading-spinner"></span>
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>

            <div className="chat-footer">
              <div className="chat-footer-note">
                <ShieldCheck size={13} />
                Mock seller data · No live Snapdeal integration ·
                {responseMode === "local" ? " Local demo mode" : ` ${providerLabel(responseMode)}`}              
                </div>

              <button
                type="button"
                className="summary-trigger"
                onClick={() => {
                  if (summaryVisible) {
                    setSummaryVisible(false);
                    return;
                  }

                  handsFreeRef.current = false;
                  setHandsFree(false);

                  stopListening();
                  stopSpeaking();
                  setSummaryVisible(true);
                }}
                disabled={sellerResponses.length === 0}
              >
                {summaryVisible
                  ? "Hide summary"
                  : "Finish conversation & view summary"}
              </button>
            </div>

            {summaryVisible && (
              <section
                className="conversation-summary"
                aria-labelledby="summary-title"
              >
                <div className="summary-heading">
                  <div>
                    <span className="summary-kicker">CONVERSATION REVIEW</span>

                    <h3 id="summary-title">Seller action summary</h3>
                  </div>

                  <span className="summary-period">7-day review</span>
                </div>

                <div className="summary-block">
                  <h4>Primary concern</h4>

                  <p>
                    Sales declined by 32.5%, from ₹2,00,000 to ₹1,35,000. Orders
                    also declined by 32.5%, while average selling price remained
                    ₹500.
                  </p>
                </div>

                <div className="summary-block">
                  <h4>Seller information shared</h4>

                  {sellerResponses.length ? (
                    <ul>
                      {sellerResponses.map((answer, index) => (
                        <li key={`${index}-${answer}`}>{answer}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional details shared yet.</p>
                  )}
                </div>

                <div className="summary-block">
                  <h4>Observed issues to investigate</h4>

                  <ul>
                    <li>Out-of-stock products increased from 5 to 18.</li>

                    <li>
                      Cancellation rate increased from 8% to 14% (+6 percentage
                      points).
                    </li>

                    <li>
                      Product impressions and views are not available in the
                      supplied dataset.
                    </li>
                  </ul>
                </div>

                <div className="summary-block">
                  <h4>Recommended next steps</h4>

                  <ol>
                    <li>
                      Replenish high-demand products and monitor stockouts
                      against the reference level of 5.
                    </li>

                    <li>
                      Review cancellation reasons, improve stock accuracy and
                      monitor the rate against 8%.
                    </li>

                    <li>
                      Compare product impressions and views before concluding
                      that visibility is a cause.
                    </li>
                  </ol>
                </div>

                <p className="summary-disclaimer">
                  Review progress in seven days. These are reference goals, not
                  guaranteed outcomes. The available figures do not prove that
                  stockouts or cancellations caused the entire sales decline.
                </p>
              </section>
            )}
          </div>

          {/* RECOMMENDATIONS AND GOALS */}
          <div className="right-column">
            <div className="panel recommendations-panel" id="recommendations">
              <div className="panel-header">
                <div>
                  <h3>Recommended actions</h3>
                  <p>Prioritised business opportunities</p>
                </div>

                <Sparkles size={19} className="orange-icon" />
              </div>

              <div className="recommendation-list">
                {sellerData.recommendations.map((item) => (
                  <div className="recommendation-item" key={item.id}>
                    <button
                      type="button"
                      className={`task-check ${
                        completed.includes(item.id) ? "checked" : ""
                      }`}
                      onClick={() => toggleTask(item.id)}
                      aria-label={`Mark ${item.title} complete`}
                      aria-pressed={completed.includes(item.id)}
                    >
                      {completed.includes(item.id) && <Check size={13} />}
                    </button>

                    <div className="recommendation-content">
                      <div className="recommendation-title">
                        <h4>{item.title}</h4>

                        <span
                          className={`priority ${item.priority.toLowerCase()}`}
                        >
                          {item.priority}
                        </span>
                      </div>

                      <p>{item.description}</p>

                      <span className="impact-label">
                        <Activity size={12} />
                        {item.impact}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="completion-info">
                <span>
                  {completed.length} of {sellerData.recommendations.length}{" "}
                  actions completed
                </span>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${
                        sellerData.recommendations.length
                          ? (completed.length /
                              sellerData.recommendations.length) *
                            100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* RECOVERY GOALS */}
            <div className="panel recovery-panel">
              <div className="panel-header">
                <div>
                  <h3>Recovery goals</h3>
                  <p>Based on previous month performance</p>
                </div>

                <TrendingDown size={19} className="orange-icon" />
              </div>

              {sellerData.recoveryGoals.map((goal) => {
                const progress = Math.min(
                  (goal.target / goal.current) * 100,
                  100
                );

                return (
                  <div className="goal-item" key={goal.label}>
                    <div className="goal-heading">
                      <strong>{goal.label}</strong>

                      <span>
                        {goal.current}
                        {goal.unit} → {goal.target}
                        {goal.unit}
                      </span>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-fill goal-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <span className="goal-caption">
                      Target: return towards last month's level
                    </span>
                  </div>
                );
              })}

              <div className="goal-note">
                <Clock3 size={15} />
                Suggested review: 7 days
              </div>
            </div>
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>SellerPulse AI · Intelligent seller assistance</span>
          <span>Independent demonstration product</span>
        </footer>
      </main>
    </div>
  );
}

export default App;