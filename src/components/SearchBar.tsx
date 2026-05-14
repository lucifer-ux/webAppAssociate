import "../componentStyling/SearchBar.css";
import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";

type SearchBarProps = {
  activeSection: "matterLibrary" | "activeResearch";
  onSubmitQuery?: (query: string) => Promise<void> | void;
  isSubmitting?: boolean;
  placeholderOverride?: string;
};

const SearchBar = ({
  activeSection,
  onSubmitQuery,
  isSubmitting = false,
  placeholderOverride,
}: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isActiveResearchMode = activeSection === "activeResearch";

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
    if (!isActiveResearchMode || isSubmitting) {
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    await onSubmitQuery?.(trimmedQuery);
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
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isActiveResearchMode || isSubmitting}
          placeholder={
            placeholderOverride
              ? placeholderOverride
              : isActiveResearchMode
              ? "Search case law, statutes, filings, or legal questions..."
              : "AI Search is only available in Active Research"
          }
          aria-label="AI search"
          rows={1}
        />
        <Button
          className="chatIconBtn"
          type="button"
          aria-label="Attach file"
          disabled={!isActiveResearchMode || isSubmitting}
        >
          <Paperclip size={16} />
        </Button>
        <Button
          className="chatSendBtn"
          type="submit"
          aria-label="Send search"
          disabled={!isActiveResearchMode || !query.trim() || isSubmitting}
        >
          <ArrowUp size={18} />
        </Button>
      </form>
    </div>
  );
};

export default SearchBar;
