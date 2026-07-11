import "../componentStyling/SearchBar.css";
import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

export type SearchBarMode = "normal" | "deep";

type SearchBarProps = {
  activeSection: "matterLibrary" | "activeResearch";
  onSubmitQuery?: (query: string, mode: SearchBarMode) => Promise<void> | void;
  isSubmitting?: boolean;
  isSubmissionBlocked?: boolean;
  placeholderOverride?: string;
  allowTextOnly?: boolean;
  enableSubmit?: boolean;
  onActivate?: () => void;
  mode?: SearchBarMode;
  onModeChange?: (mode: SearchBarMode) => void;
  showModeSelector?: boolean;
};

const SearchBar = ({
  activeSection,
  onSubmitQuery,
  isSubmitting = false,
  isSubmissionBlocked = false,
  placeholderOverride,
  allowTextOnly = false,
  enableSubmit,
  onActivate,
  mode = "normal",
  onModeChange,
  showModeSelector = true,
}: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isActiveResearchMode = activeSection === "activeResearch";
  const isInputEnabled = isActiveResearchMode || allowTextOnly;
  const canSubmit =
    (enableSubmit ?? isActiveResearchMode) && Boolean(onSubmitQuery);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 176);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 176 ? "auto" : "hidden";
  }, [query]);

  const submitQuery = async () => {
    if (!canSubmit || isSubmitting || isSubmissionBlocked) {
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    await onSubmitQuery?.(trimmedQuery, mode);
    setQuery("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitQuery();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuery();
    }
  };

  return (
    <div className="chatDockWrap">
      <form className="chatDock" onSubmit={handleSubmit}>
        <div className="chatSparkle">a.</div>
        {showModeSelector ? (
          <div className="chatModeSwitch" role="tablist" aria-label="AI mode">
            <button
              type="button"
              className={`chatModeOption ${mode === "normal" ? "is-active" : ""}`}
              onClick={() => onModeChange?.("normal")}
              aria-pressed={mode === "normal"}
            >
              Normal Chat
            </button>
            <button
              type="button"
              className={`chatModeOption ${mode === "deep" ? "is-active" : ""}`}
              onClick={() => onModeChange?.("deep")}
              aria-pressed={mode === "deep"}
            >
              Deep Research
            </button>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={onActivate}
          onClick={onActivate}
          onKeyDown={handleKeyDown}
          disabled={!isInputEnabled || isSubmitting || isSubmissionBlocked}
          placeholder={
            placeholderOverride
              ? placeholderOverride
              : isActiveResearchMode
                ? "Ask a legal question or start deep research..."
                : "Ask about this matter..."
          }
          aria-label="AI search"
          rows={1}
        />
        <Button
          className="chatSendBtn"
          type="submit"
          aria-label="Send search"
          disabled={!canSubmit || !query.trim() || isSubmitting || isSubmissionBlocked}
        >
          <ArrowUp size={18} />
        </Button>
      </form>
    </div>
  );
};

export default SearchBar;
