import "../componentStyling/ChatBoxMatterSection.css";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bot, Sparkles, X } from "lucide-react";
import Button from "./Button";
import SearchBar, { type SearchBarMode } from "./SearchBar";

export type MatterChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  sources?: ChatSource[];
};

export type ChatSource = {
  type: "agent_brief" | "contextcore" | "exa" | string;
  title: string;
  detail?: string;
  url?: string;
  chunkId?: string;
};

const THINKING_MESSAGES = [
  "Reading the question against the matter record",
  "Checking the agent brief and verified facts",
  "Reviewing relevant law and inference",
  "Looking for source-backed support",
  "Preparing a clear lawyer-facing answer",
];

type ChatBoxMatterSectionProps = {
  open: boolean;
  matterTitle: string;
  clarificationQuestions?: string[];
  isSubmittingClarification?: boolean;
  clarificationError?: string;
  messages?: MatterChatMessage[];
  chatMode?: SearchBarMode;
  isSubmittingChat?: boolean;
  chatError?: string;
  onClose: () => void;
  onSubmitClarification?: (answer: string) => Promise<void> | void;
  onSkipClarification?: () => Promise<void> | void;
  onSubmitChat?: (
    message: string,
    mode: SearchBarMode,
  ) => Promise<void> | void;
  onModeChange?: (mode: SearchBarMode) => void;
};

const SUGGESTED_PROMPTS = [
  "What is missing before the brief can be finalized?",
  "Summarize the uploaded documents.",
  "What should I review first?",
  "List limitation and deadline issues.",
];

const ASSISTANT_SKIP_MESSAGE =
  "Sure, I will think about the brief with the data that I have.";
const TYPEWRITER_DELAY_MS = 28;
const TYPEWRITER_CLOSE_DELAY_MS = 420;

const ChatBoxMatterSection = ({
  open,
  matterTitle,
  clarificationQuestions = [],
  isSubmittingClarification = false,
  clarificationError = "",
  messages = [],
  chatMode = "normal",
  isSubmittingChat = false,
  chatError = "",
  onClose,
  onSubmitClarification,
  onSkipClarification,
  onSubmitChat,
  onModeChange,
}: ChatBoxMatterSectionProps) => {
  const [typingMessage, setTypingMessage] = useState("");
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState(THINKING_MESSAGES[0]);
  const hasClarificationQuestions = clarificationQuestions.length > 0;

  useEffect(() => {
    if (!isSubmittingChat) {
      setThinkingMessage(THINKING_MESSAGES[0]);
      return;
    }

    let timeoutId = 0;
    const rotate = () => {
      setThinkingMessage(
        THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)],
      );
      timeoutId = window.setTimeout(rotate, 2000 + Math.random() * 2000);
    };
    timeoutId = window.setTimeout(rotate, 2000 + Math.random() * 2000);
    return () => window.clearTimeout(timeoutId);
  }, [isSubmittingChat]);

  const openingMessage = useMemo(() => {
    if (hasClarificationQuestions) {
      return [
        "I need these details before I can generate a grounded matter brief:",
        ...clarificationQuestions.map((question, index) => `${index + 1}. ${question}`),
      ].join("\n");
    }

    return "Ask a matter-specific question or switch to Deep Research for a heavier pass through the record.";
  }, [clarificationQuestions, hasClarificationQuestions]);

  const visibleMessages = useMemo<MatterChatMessage[]>(
    () => [
      {
        id: "opening",
        role: "assistant",
        text: openingMessage,
      },
      ...messages,
    ],
    [messages, openingMessage],
  );

  if (!open) return null;

  const handleSubmit = async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    if (hasClarificationQuestions && onSubmitClarification) {
      await onSubmitClarification(trimmedQuery);
      return;
    }

    await onSubmitChat?.(trimmedQuery, chatMode);
  };

  const handleSuggestionClick = (prompt: string) => {
    void handleSubmit(prompt);
  };

  const handleClose = () => {
    setTypingMessage("");
    setIsAssistantTyping(false);
    onClose();
  };

  const handleSkip = async () => {
    if (isAssistantTyping) return;

    setIsAssistantTyping(true);
    setTypingMessage("");

    const skipPromise = Promise.resolve(onSkipClarification?.());

    for (let index = 1; index <= ASSISTANT_SKIP_MESSAGE.length; index += 1) {
      setTypingMessage(ASSISTANT_SKIP_MESSAGE.slice(0, index));
      await new Promise((resolve) =>
        window.setTimeout(resolve, TYPEWRITER_DELAY_MS),
      );
    }

    await skipPromise;
    await new Promise((resolve) =>
      window.setTimeout(resolve, TYPEWRITER_CLOSE_DELAY_MS),
    );
    setIsAssistantTyping(false);
    handleClose();
  };

  return (
    <div className="matterChatBackdrop" role="presentation">
      <section className="matterChatBox" role="dialog" aria-modal="true">
        <header className="matterChatHeader">
          <div>
            <p className="matterChatEyebrow">
              <Sparkles size={13} /> Matter Chat
            </p>
            <h2>{matterTitle}</h2>
          </div>
          <Button
            type="button"
            className="matterChatClose"
            onClick={handleClose}
            aria-label="Close matter chat"
            disabled={isAssistantTyping}
            showImage
            image={<X size={18} />}
          />
        </header>

        <div className="matterChatMessages">
          {visibleMessages.map((message) => (
            <article
              className={`matterChatMessage is-${message.role}`}
              key={message.id}
            >
              {message.role === "assistant" ? (
                <span className="matterChatAvatar">
                  <Bot size={15} />
                </span>
              ) : null}
              <div className="matterChatMessageBody">
                <p>{message.text}</p>
                {message.sources?.length ? (
                  <div className="matterChatSources">
                    <span>Sources</span>
                    {message.sources.map((source, index) =>
                      source.url ? (
                        <a
                          key={`${source.type}-${source.title}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <strong>{source.title}</strong>
                          <small>{source.detail || source.type}</small>
                          <ArrowUpRight size={13} />
                        </a>
                      ) : (
                        <div key={`${source.type}-${source.title}-${index}`}>
                          <strong>{source.title}</strong>
                          <small>{source.detail || source.type}</small>
                        </div>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {isSubmittingChat ? (
            <article className="matterChatThinking" aria-live="polite">
              <span className="matterChatThinkingMark">a.</span>
              <div>
                <strong>Associate is thinking</strong>
                <p>{thinkingMessage}</p>
              </div>
              <span className="matterChatThinkingPulse" aria-hidden="true" />
            </article>
          ) : null}
          {typingMessage ? (
            <article className="matterChatMessage is-assistant isTyping">
              <span className="matterChatAvatar">
                <Bot size={15} />
              </span>
              <p>
                {typingMessage}
                {isAssistantTyping ? (
                  <span
                    className="matterChatTypingIndicator"
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
              </p>
            </article>
          ) : null}
        </div>

        {!hasClarificationQuestions ? (
          <div className="matterChatSuggestions">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Button
                type="button"
                key={prompt}
                onClick={() => handleSuggestionClick(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        ) : null}

        {clarificationError || chatError ? (
          <p className="matterChatError">{clarificationError || chatError}</p>
        ) : null}

        {hasClarificationQuestions ? (
          <div className="matterChatClarificationActions">
            <Button
              type="button"
              onClick={() => void handleSkip()}
              disabled={isSubmittingClarification || isAssistantTyping}
            >
              Skip these questions
            </Button>
          </div>
        ) : null}

        <div className="matterChatComposer">
          <SearchBar
            activeSection="matterLibrary"
            allowTextOnly
            enableSubmit
            isSubmitting={
              isSubmittingClarification || isAssistantTyping || isSubmittingChat
            }
            onSubmitQuery={handleSubmit}
            mode={chatMode}
            onModeChange={onModeChange}
            showModeSelector={!hasClarificationQuestions}
            placeholderOverride={
              hasClarificationQuestions
                ? "Answer the clarification questions..."
                : "Message this matter..."
            }
          />
        </div>
      </section>
    </div>
  );
};

export default ChatBoxMatterSection;
