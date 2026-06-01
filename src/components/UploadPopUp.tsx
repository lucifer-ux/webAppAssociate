import "../componentStyling/UploadPopUp.css";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { CirclePlus, FileText, X } from "lucide-react";
import Button from "./Button";

export type UploadPopupValidationItem = {
  fileName: string;
  accepted: boolean;
  error?: string;
  sizeBytes?: number;
  estimatedPages?: number | null;
  pageCount?: number | null;
  detectedMime?: string;
  hasExecutableSignals?: boolean;
};

type UploadPopUpProps = {
  open: boolean;
  title: string;
  description: string;
  queryValue: string;
  onQueryChange: (value: string) => void;
  selectedFiles: File[];
  validations: UploadPopupValidationItem[];
  maxFiles: number;
  sizeLimitLabel: string;
  maxPages: number;
  isValidating: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  submitLabel: string;
  allowEmptyFiles?: boolean;
  showContextCoreOption?: boolean;
  contextCoreChecked?: boolean;
  onContextCoreCheckedChange?: (checked: boolean) => void;
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (fileName: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
};

const UploadPopUp = ({
  open,
  title,
  description,
  queryValue,
  onQueryChange,
  selectedFiles,
  validations,
  maxFiles,
  sizeLimitLabel,
  maxPages,
  isValidating,
  isSubmitting,
  errorMessage,
  submitLabel,
  allowEmptyFiles = false,
  showContextCoreOption = false,
  contextCoreChecked = false,
  onContextCoreCheckedChange,
  onFilesSelected,
  onRemoveFile,
  onCancel,
  onSubmit,
}: UploadPopUpProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const validationByFileName = useMemo(
    () => new Map(validations.map((item) => [item.fileName, item])),
    [validations],
  );

  if (!open) return null;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;
    onFilesSelected(nextFiles);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (!droppedFiles.length) return;
    onFilesSelected(droppedFiles);
  };

  const acceptedCount = validations.filter((item) => item.accepted).length;
  const hasMessage = Boolean(queryValue.trim());
  const allAccepted =
    allowEmptyFiles ||
    (selectedFiles.length > 0 &&
      validations.length === selectedFiles.length &&
      validations.every((item) => item.accepted));

  return (
    <div
      className="uploadPopupBackdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-popup-title"
    >
      <div className="uploadPopupShell">
        <div className="uploadPopupHead">
          <div>
            <h2 id="upload-popup-title">{title}</h2>
            <p className="uploadPopupDescription">{description}</p>
          </div>
          <Button
            type="button"
            className="uploadPopupCloseBtn"
            aria-label="Close upload popup"
            onClick={onCancel}
            showImage
            image={<X size={16} />}
          />
        </div>

        <div
          className={`uploadPopupDropZone ${isDragActive ? "isDragActive" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node))
              return;
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            className="uploadPopupFileInput"
            accept=".pdf,text/*,.md,.txt,.text,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.log,.ini,.cfg,.conf,.rtf,.sql"
            multiple
            onChange={handleInputChange}
          />
          <span className="uploadPopupIcon" aria-hidden="true">
            <CirclePlus size={48} strokeWidth={1.6} />
          </span>
          <strong>Drag and drop files here</strong>
          <p>or click anywhere in this block to browse</p>
        </div>

        <div className="uploadPopupContentGrid">
          <div className="uploadPopupLeftColumn">
            <div className="uploadPopupMetaInline">
              Up to {maxFiles} files • {sizeLimitLabel} each • {maxPages} pages
              max for PDFs
            </div>

            <label className="uploadPopupPromptField">
              <span>Input context (required)</span>
              <div className="uploadPopupPromptBox">
                <textarea
                  value={queryValue}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Add any instructions, background, or questions that should travel with this upload."
                  rows={4}
                />
              </div>
              <p className="uploadPopupPromptHint">
                Hint: add the legal issue, desired outcome, and urgency.
              </p>
            </label>
            {showContextCoreOption ? (
              <label className="uploadPopupToggle">
                <input
                  type="checkbox"
                  checked={contextCoreChecked}
                  onChange={(event) =>
                    onContextCoreCheckedChange?.(event.target.checked)
                  }
                  disabled={isSubmitting}
                />
                <div>
                  <strong>Pass through ContextCore</strong>
                  <p>
                    Index these uploaded source files for matter-scoped
                    paragraph retrieval.
                  </p>
                </div>
              </label>
            ) : null}
          </div>

          <div className="uploadPopupFilesPanel">
            <div className="uploadPopupFilesHead">
              <h3>Selected files</h3>
              <span>
                {selectedFiles.length} selected
                {selectedFiles.length
                  ? ` • ${acceptedCount} verified`
                  : allowEmptyFiles
                    ? " • optional in mock mode"
                    : ""}
              </span>
            </div>

            {selectedFiles.length ? (
              <div className="uploadPopupFilesList">
                {selectedFiles.map((file) => {
                  const validation = validationByFileName.get(file.name);
                  const badgeLabel = validation
                    ? validation.accepted
                      ? "Verified"
                      : "Rejected"
                    : isValidating
                      ? "Checking"
                      : "Queued";
                  return (
                    <article
                      className="uploadPopupFileCard"
                      key={`${file.name}-${file.size}`}
                    >
                      <div className="uploadPopupFileCardMain">
                        <span
                          className="uploadPopupFileGlyph"
                          aria-hidden="true"
                        >
                          <FileText size={18} />
                        </span>
                        <div className="uploadPopupFileMeta">
                          <strong>{file.name}</strong>
                          <p>
                            {formatBytes(file.size)}
                            {validation?.pageCount
                              ? ` • ${validation.pageCount} pages`
                              : ""}
                            {!validation?.pageCount &&
                            validation?.estimatedPages
                              ? ` • est. ${validation.estimatedPages} pages`
                              : ""}
                          </p>
                          {validation?.error ? (
                            <p className="uploadPopupFileError">
                              {validation.error}
                            </p>
                          ) : null}
                          {validation?.hasExecutableSignals ? (
                            <p className="uploadPopupFileWarn">
                              Executable or installer signals detected in this
                              file.
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="uploadPopupFileCardActions">
                        <span className="uploadPopupStatusText">
                          {badgeLabel}
                        </span>
                        <Button
                          type="button"
                          className="uploadPopupRemoveBtn"
                          onClick={() => onRemoveFile(file.name)}
                          aria-label={`Remove ${file.name}`}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="uploadPopupEmptyState">
                <p>No files selected yet.</p>
              </div>
            )}
          </div>
        </div>

        {errorMessage ? (
          <p className="uploadPopupErrorBanner">{errorMessage}</p>
        ) : null}

        <div className="uploadPopupActions">
          <Button
            type="button"
            className="uploadPopupSubmitBtn"
            onClick={onSubmit}
            disabled={
              isSubmitting || isValidating || !allAccepted || !hasMessage
            }
            aria-label={submitLabel}
            text={submitLabel}
          />
        </div>
      </div>
    </div>
  );
};

export default UploadPopUp;
