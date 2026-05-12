import "../componentStyling/MatterSection.css";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarClock,
  FileText,
  FolderOpen,
  Plus,
  Scale,
  ShieldCheck,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import {
  useMatterStore,
  type ClauseItem,
} from "../context/MatterStoreContext";

const formatUploadedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const mergeRanges = (ranges: Array<{ start: number; end: number }>) => {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  sorted.forEach((range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      return;
    }
    previous.end = Math.max(previous.end, range.end);
  });

  return merged;
};

const renderHighlightedText = (
  text: string,
  ranges: Array<{ start: number; end: number }>,
) => {
  if (!ranges.length) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;

  mergeRanges(ranges).forEach((range, index) => {
    if (cursor < range.start) {
      parts.push(
        <span key={`plain-${index}-${cursor}`}>
          {text.slice(cursor, range.start)}
        </span>,
      );
    }

    parts.push(
      <mark key={`mark-${index}-${range.start}`}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    parts.push(<span key={`plain-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return parts;
};

const MatterSection = () => {
  const { activeMatter, addPersonToMatter } = useMatterStore();
  const [isPeopleDialogOpen, setIsPeopleDialogOpen] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const people = activeMatter?.people || [];
  const pages = activeMatter?.pageAwareStructure.pages || [];
  const clauseSections = activeMatter?.pageAwareStructure.sections || [];

  const totalBlockCount = useMemo(
    () =>
      pages.reduce((count, page) => count + page.blocks.length, 0),
    [pages],
  );

  const activeClause = useMemo(() => {
    for (const section of clauseSections) {
      const matchedClause = section.clauses.find(
        (clause) => clause.clause_id === activeClauseId,
      );
      if (matchedClause) return matchedClause;
    }
    return null;
  }, [activeClauseId, clauseSections]);

  const highlightMap = useMemo(() => {
    const map = new Map<string, Array<{ start: number; end: number }>>();
    if (!activeClause) return map;

    activeClause.source_refs.forEach((sourceRef) => {
      const existing = map.get(sourceRef.block_id) || [];
      existing.push({
        start: sourceRef.start_char_in_block,
        end: sourceRef.end_char_in_block,
      });
      map.set(sourceRef.block_id, existing);
    });

    return map;
  }, [activeClause]);

  useEffect(() => {
    setActiveClauseId(null);
  }, [activeMatter?.id]);

  useEffect(() => {
    const firstSourceRef = activeClause?.source_refs[0];
    if (!firstSourceRef) return;

    const target = blockRefs.current[firstSourceRef.block_id];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeClause]);

  const resetPersonForm = () => {
    setPersonName("");
    setPersonRole("");
    setPersonDescription("");
  };

  const handleAddPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMatter || !personName.trim()) return;

    addPersonToMatter(activeMatter.id, {
      name: personName.trim(),
      role: personRole.trim() || "Party",
      description: personDescription.trim() || "Added manually",
    });
    resetPersonForm();
    setIsPeopleDialogOpen(false);
  };

  const handleClauseSelect = (clause: ClauseItem) => {
    setActiveClauseId(clause.clause_id);
  };

  return (
    <section className="matterOverviewWrap">
      <header className="matterOverviewHead">
        <p className="matterEyebrow">Matter Overview</p>
        <h1>{activeMatter?.title || "No matter uploaded yet"}</h1>
        <p className="matterSubhead">
          Focused view for quick orientation, working notes, and clause-aware
          document review.
        </p>
      </header>

      <section className="matterPeopleSection">
        <div className="matterPeopleHead">
          <h2>People</h2>
          <button
            type="button"
            className="matterPeopleAddBtn"
            disabled={!activeMatter}
            onClick={() => setIsPeopleDialogOpen(true)}
            aria-label="Add a person to this matter"
          >
            <Plus size={18} />
          </button>
        </div>

        {people.length ? (
          <div className="matterPeopleGrid">
            {people.map((person) => (
              <article className="matterPersonCard" key={person.id}>
                <span className="matterPersonAvatar">{person.initials}</span>
                <div>
                  <h3>{person.name}</h3>
                  <strong>{person.role}</strong>
                  <p>{person.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="matterPeopleEmptyAdd"
            disabled={!activeMatter}
            onClick={() => setIsPeopleDialogOpen(true)}
          >
            <Plus size={22} />
            <span>Add people manually</span>
          </button>
        )}
      </section>

      <div className="matterMetaGrid">
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <FolderOpen size={16} />
          </span>
          <div>
            <h3>File name</h3>
            <p>{activeMatter?.fileName || "Upload a file to start."}</p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <CalendarClock size={16} />
          </span>
          <div>
            <h3>Uploaded</h3>
            <p>
              {activeMatter?.uploadedAt
                ? formatUploadedAt(activeMatter.uploadedAt)
                : "Not available"}
            </p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <FileText size={16} />
          </span>
          <div>
            <h3>Document type</h3>
            <p>{activeMatter?.mimeType || "Unknown"}</p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <Scale size={16} />
          </span>
          <div>
            <h3>Status</h3>
            <p>
              {activeMatter
                ? activeMatter.status === "processed"
                  ? "Document ingested (server processed)"
                  : activeMatter.status
                : "Waiting for upload"}
            </p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <FileText size={16} />
          </span>
          <div>
            <h3>Version hash</h3>
            <p>
              {activeMatter?.sha256
                ? `${activeMatter.sha256.slice(0, 12)}...`
                : "Not available"}
            </p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <SplitSquareHorizontal size={16} />
          </span>
          <div>
            <h3>Pages / Words</h3>
            <p>
              {activeMatter
                ? `${activeMatter.page_count} pages / ${activeMatter.word_count.toLocaleString()} words`
                : "Not available"}
            </p>
          </div>
        </article>
      </div>

      <div className="matterStructureGrid">
        <article className="matterQualityPanel matterStructureCard">
          <div className="matterTextPanelHead">
            <h2>Extracted fields</h2>
            <span>Backend response</span>
          </div>
          <div className="matterFieldList">
            <div>
              <strong>Parties</strong>
              <p>
                {activeMatter?.extractedFields.parties.length
                  ? activeMatter.extractedFields.parties
                      .map((party) => `${party.name} (${party.role})`)
                      .join(", ")
                  : "Not extracted in this pass"}
              </p>
            </div>
            <div>
              <strong>Effective date</strong>
              <p>
                {activeMatter?.extractedFields.effective_date.value || "Not found"}
              </p>
            </div>
            <div>
              <strong>Governing law</strong>
              <p>
                {activeMatter?.extractedFields.governing_law.value || "Not found"}
              </p>
            </div>
            <div>
              <strong>Contract term</strong>
              <p>
                {activeMatter?.extractedFields.contract_term.value || "Not found"}
              </p>
            </div>
            <div>
              <strong>Notice period</strong>
              <p>
                {activeMatter?.extractedFields.notice_period.value || "Not found"}
              </p>
            </div>
          </div>
        </article>

        <article className="matterQualityPanel matterStructureCard">
          <div className="matterTextPanelHead">
            <h2>Matter health</h2>
            <span>{activeMatter?.health.completeness_score ?? 0}% complete</span>
          </div>
          <div className="matterHealthBody">
            <div className="matterHealthScore">
              {activeMatter?.health.completeness_score ?? 0}
            </div>
            <div>
              <strong>Missing clauses</strong>
              <p>
                {activeMatter?.health.missing_clauses.length
                  ? activeMatter.health.missing_clauses.join(", ")
                  : "No missing clauses detected"}
              </p>
              <strong>Flagged clauses</strong>
              <p>
                {activeMatter?.health.flagged_clauses.length
                  ? activeMatter.health.flagged_clauses.join(", ")
                  : "No flagged clauses"}
              </p>
            </div>
          </div>
        </article>
      </div>

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Page index</h2>
          <span>{activeMatter?.pageIndex.length || 0} sections</span>
        </div>
        <div className="matterPageIndexList">
          {activeMatter?.pageIndex.length ? (
            activeMatter.pageIndex.map((item) => (
              <div
                className={`matterPageIndexItem matterPageIndexItem-${item.status}`}
                key={`${item.type}-${item.start}-${item.end}`}
              >
                <span>{item.label}</span>
                <strong>
                  Page {item.start}
                  {item.end !== item.start ? `-${item.end}` : ""}
                </strong>
              </div>
            ))
          ) : (
            <p>No page index available yet.</p>
          )}
        </div>
      </article>

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Page-aware structure</h2>
          <span>{clauseSections.length} sections</span>
        </div>
        <div className="matterClauseSections">
          {clauseSections.length ? (
            clauseSections.map((section) => (
              <section className="matterClauseSectionCard" key={section.section_id}>
                <div className="matterClauseSectionHead">
                  <div>
                    <strong>{section.section_label}</strong>
                    <span>
                      Page {section.page_start}
                      {section.page_end !== section.page_start
                        ? `-${section.page_end}`
                        : ""}
                    </span>
                  </div>
                  <small>{section.section_type.replace(/_/g, " ")}</small>
                </div>

                {section.extraction_status === "ready" && section.clauses.length ? (
                  <div className="matterClauseList">
                    {section.clauses.map((clause) => (
                      <button
                        key={clause.clause_id}
                        type="button"
                        className={`matterClauseItem ${
                          activeClauseId === clause.clause_id ? "active" : ""
                        }`}
                        onClick={() => handleClauseSelect(clause)}
                      >
                        <strong>{clause.heading}</strong>
                        <p>{clause.display_text}</p>
                        <span>
                          {clause.grounding_status === "approximate"
                            ? "Approximate match"
                            : "Exact match"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : section.extraction_status === "failed" ? (
                  <p className="matterClauseEmpty">
                    Clause extraction failed for this section. {section.error}
                  </p>
                ) : section.extraction_status === "skipped" ? (
                  <p className="matterClauseEmpty">
                    Clause extraction is skipped for this section type.
                  </p>
                ) : (
                  <p className="matterClauseEmpty">No clauses extracted yet.</p>
                )}
              </section>
            ))
          ) : (
            <p className="matterQualityEmpty">No page-aware structure available yet.</p>
          )}
        </div>
      </article>

      <article className="matterTextPanel">
        <div className="matterTextPanelHead">
          <h2>Extracted document</h2>
          <span>
            {pages.length} pages · {totalBlockCount} blocks
          </span>
        </div>
        <div className="matterDocumentViewer">
          {pages.length ? (
            pages.map((page) => (
              <section className="matterDocumentPage" key={page.page_number}>
                <div className="matterDocumentPageHead">
                  <strong>Page {page.page_number}</strong>
                  <span>{page.label || "other"}</span>
                </div>
                <div className="matterDocumentBlockList">
                  {page.blocks.map((block) => {
                    const blockRanges = highlightMap.get(block.block_id) || [];
                    return (
                      <div
                        key={block.block_id}
                        ref={(node) => {
                          blockRefs.current[block.block_id] = node;
                        }}
                        className={`matterDocumentBlock matterDocumentBlock-${block.type} ${
                          blockRanges.length ? "isHighlighted" : ""
                        }`}
                      >
                        <p>{renderHighlightedText(block.text, blockRanges)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="matterQualityEmpty">No extracted document available yet.</p>
          )}
        </div>
      </article>

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Text quality</h2>
          <span>{activeMatter?.nextStep || "Waiting for upload"}</span>
        </div>
        <div className="matterQualityBody">
          <div className="matterQualityScore">
            <span className="matterMetaIcon">
              <ShieldCheck size={16} />
            </span>
            <div>
              <h3>{activeMatter?.textQuality.level || "UNKNOWN"}</h3>
              <p>
                {activeMatter
                  ? `${Math.round(activeMatter.textQuality.score * 100)}% quality score`
                  : "No quality check available"}
              </p>
            </div>
          </div>

          <div className="matterQualityMetrics">
            <span>
              Characters: {activeMatter?.textQuality.metrics.character_count || 0}
            </span>
            <span>Words: {activeMatter?.textQuality.metrics.word_count || 0}</span>
            <span>
              Empty pages: {activeMatter?.textQuality.metrics.empty_pages || 0}
            </span>
            <span>
              Script: {activeMatter?.textQuality.metrics.language_script || "Unknown"}
            </span>
            <span>
              Tables: {activeMatter?.textQuality.metrics.table_like_block_count || 0}
            </span>
            <span>Blocks: {totalBlockCount || 0}</span>
          </div>

          {activeMatter?.textQuality.issues.length ? (
            <ul className="matterQualityIssues">
              {activeMatter.textQuality.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="matterQualityEmpty">
              No blocking quality issues detected.
            </p>
          )}
        </div>
      </article>

      {isPeopleDialogOpen && (
        <div className="matterDialogBackdrop" role="presentation">
          <form className="matterPeopleDialog" onSubmit={handleAddPerson}>
            <div className="matterPeopleDialogHead">
              <div>
                <p className="matterEyebrow">People</p>
                <h2>Add person</h2>
              </div>
              <button
                type="button"
                aria-label="Close add person dialog"
                onClick={() => {
                  resetPersonForm();
                  setIsPeopleDialogOpen(false);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <label>
              Name
              <input
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
                placeholder="Anand Krishnamurthy"
                autoFocus
                required
              />
            </label>
            <label>
              Role
              <input
                value={personRole}
                onChange={(event) => setPersonRole(event.target.value)}
                placeholder="Petitioner, Counsel, Witness"
              />
            </label>
            <label>
              Notes
              <textarea
                value={personDescription}
                onChange={(event) => setPersonDescription(event.target.value)}
                placeholder="Your client · DOB · Contact · next date"
                rows={3}
              />
            </label>

            <div className="matterPeopleDialogActions">
              <button
                type="button"
                onClick={() => {
                  resetPersonForm();
                  setIsPeopleDialogOpen(false);
                }}
              >
                Cancel
              </button>
              <button type="submit">Add person</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default MatterSection;
