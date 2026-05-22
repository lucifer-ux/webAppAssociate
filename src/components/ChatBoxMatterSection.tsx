import "../componentStyling/ChatBoxMatterSection.css";
import { useEffect, useMemo, useState } from "react";
import { Bot, Sparkles, X } from "lucide-react";
import Button from "./Button";
import SearchBar from "./SearchBar";

type MatterChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type ChatBoxMatterSectionProps = {
  open: boolean;
  matterTitle: string;
  clarificationQuestions?: string[];
  isSubmittingClarification?: boolean;
  clarificationError?: string;
  onClose: () => void;
  onSubmitClarification?: (answer: string) => Promise<void> | void;
  onSkipClarification?: () => Promise<void> | void;
};

const SUGGESTED_PROMPTS = [
  "What is missing before the brief can be finalized?",
  "Summarize the uploaded documents.",
  "What should I review first?",
  "List limitation and deadline issues.",
];

const createMessageId = () =>
  `matter_chat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

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
  onClose,
  onSubmitClarification,
  onSkipClarification,
}: ChatBoxMatterSectionProps) => {
  const [messages, setMessages] = useState<MatterChatMessage[]>([]);
  const [typingMessage, setTypingMessage] = useState("");
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const hasClarificationQuestions = clarificationQuestions.length > 0;

  useEffect(() => {
    if (open) return;
    setTypingMessage("");
    setIsAssistantTyping(false);
  }, [open]);

  const openingMessage = useMemo(() => {
    if (hasClarificationQuestions) {
      return [
        "I need these details before I can generate a grounded matter brief:",
        ...clarificationQuestions.map((question, index) => `${index + 1}. ${question}`),
      ].join("\n");
    }

    return "Ask a matter-specific question or pick a suggested prompt. This chat is local for now and will be connected to the matter LLM next.";
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

    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), role: "user", text: trimmedQuery },
    ]);

    if (hasClarificationQuestions && onSubmitClarification) {
      await onSubmitClarification(trimmedQuery);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: "assistant",
        text: "Matter chat is ready. LLM responses are not connected yet, so this message is a placeholder.",
      },
    ]);
  };

  const handleSuggestionClick = (prompt: string) => {
    void handleSubmit(prompt);
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
    onClose();
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
            onClick={onClose}
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
              <p>{message.text}</p>
            </article>
          ))}
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

        {clarificationError ? (
          <p className="matterChatError">{clarificationError}</p>
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
            isSubmitting={isSubmittingClarification || isAssistantTyping}
            onSubmitQuery={handleSubmit}
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
