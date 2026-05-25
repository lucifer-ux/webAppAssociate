import "../componentStyling/HomeDashboardStyling.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import ProductNavbar from "./ProductNavbar";
import DraftingDocument, {
  type DraftingEditorHandle,
  type DraftingToolbarState,
} from "./DraftingDocument";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";
import {
  createDraft,
  deriveDraftContextFromMatter,
  getDraftReview,
  getDraft,
  getNextStepTemplate,
  hashDraftContent,
  patchDraft,
  saveDraft,
  triggerDraftReview,
  type AccessRole,
  type DraftComment,
  type DraftDetail,
  type PendingAnnotation,
  type ParagraphStyle,
  type ZoomLevel,
} from "./draftingApi";
import { buildDraftingExtensions } from "./draftingExtensions";

const FONT_FAMILIES = ["Newsreader", "Georgia", "Times New Roman", "Work Sans"];
const COLOR_CHOICES = ["#1b1c19", "#4c0003", "#6f5d55", "#0f5b78"];

const styleMap: Record<ParagraphStyle, string> = {
  normal: "P",
  title: "TITLE",
  "heading-1": "H1",
  "heading-2": "H2",
  "heading-3": "H3",
  "heading-4": "H4",
  "heading-5": "H5",
  "heading-6": "H6",
  quote: "BLOCKQUOTE",
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sourceTextToHtml = (title: string, text: string) => {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 220);

  return [
    `<h1>${escapeHtml(title || "Source document")}</h1>`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`),
  ].join("");
};

const blankDraftHtml = () =>
  [
    "<h1>Untitled legal draft</h1>",
    "<p></p>",
  ].join("");

const nextStepScratchHtml = ({
  title,
  description,
  reason,
  requiredInputs,
}: {
  title: string;
  description: string;
  reason: string;
  requiredInputs: string[];
}) =>
  [
    `<h1>${escapeHtml(title || "Draft from next step")}</h1>`,
    description ? `<p>${escapeHtml(description)}</p>` : "<p></p>",
    reason ? `<h2>Why This Draft</h2><p>${escapeHtml(reason)}</p>` : "",
    requiredInputs.length
      ? `<h2>Required Inputs</h2>${requiredInputs
          .map((item) => `<p>[ ] ${escapeHtml(item)}</p>`)
          .join("")}`
      : "",
    "<h2>Draft</h2><p></p>",
  ].join("");

const initialToolbarState: DraftingToolbarState = {
  paragraphStyle: "normal",
  fontFamily: "Newsreader",
  fontSize: 12,
  textColor: "#1b1c19",
  blankFieldCount: 0,
  wordCount: 0,
  characterCount: 0,
  canUndo: false,
  canRedo: false,
  isBoldActive: false,
  isItalicActive: false,
  isUnderlineActive: false,
  isStrikeActive: false,
  isHighlightActive: false,
  isLinkActive: false,
  isAlignLeftActive: true,
  isAlignCenterActive: false,
  isAlignRightActive: false,
  isAlignJustifyActive: false,
  isBulletListActive: false,
  isOrderedListActive: false,
  headings: [],
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "loading";

const DraftingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editorRef = useRef<DraftingEditorHandle | null>(null);
  const savedHashRef = useRef("");
  const currentHashRef = useRef("");
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const { matters, activeMatter, setActiveMatterId } = useMatterStore();
  const matterIdFromQuery = String(searchParams.get("matter") || "").trim();
  const draftIdFromQuery = String(searchParams.get("draft") || "").trim();
  const sourceDocumentFromQuery = String(searchParams.get("sourceDocument") || "").trim();
  const plannerGroundFromQuery = String(searchParams.get("plannerGround") || "").trim();
  const plannerStepFromQuery = String(searchParams.get("plannerStep") || "").trim();
  const draftModeFromQuery = String(searchParams.get("draftMode") || "").trim().toLowerCase();
  const sourceDraftRequestRef = useRef("");
  const blankDraftRequestRef = useRef("");
  const nextStepDraftRequestRef = useRef("");
  const selectedMatter = useMemo(
    () =>
      matters.find((matter) => matter.id === matterIdFromQuery) ||
      activeMatter ||
      null,
    [activeMatter, matterIdFromQuery, matters],
  );

  const [activeDraft, setActiveDraft] = useState<DraftDetail | null>(null);
  const [documentTitle, setDocumentTitle] = useState("Untitled legal draft");
  const [currentRole] = useState<AccessRole>("editor");
  const [requestEditPending, setRequestEditPending] = useState(false);
  const [comments, setComments] = useState<DraftComment[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [toolbarState, setToolbarState] = useState<DraftingToolbarState>(initialToolbarState);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("100%");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [currentContentJson, setCurrentContentJson] = useState(activeDraft?.contentJson || {});
  const [loadError, setLoadError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "running" | "ready" | "error">("idle");

  useEffect(() => {
    if (!matterIdFromQuery) return;
    if (!matters.some((matter) => matter.id === matterIdFromQuery)) return;
    setActiveMatterId(matterIdFromQuery);
  }, [matterIdFromQuery, matters, setActiveMatterId]);

  useEffect(() => {
    if (!draftIdFromQuery) {
      setActiveDraft(null);
      setDocumentTitle("Untitled legal draft");
      setCurrentContentJson({});
      savedHashRef.current = "";
      currentHashRef.current = "";
      setSaveStatus("idle");
      setLoadError("");
      return;
    }

    let cancelled = false;
    setSaveStatus("loading");
    setLoadError("");

    void (async () => {
      try {
        const draft = await getDraft(draftIdFromQuery);
        if (cancelled) return;
        setActiveDraft(draft);
        setDocumentTitle(draft.title);
        setCurrentContentJson(draft.contentJson || {});
        const hash = hashDraftContent(draft.contentJson || {});
        savedHashRef.current = hash;
        currentHashRef.current = hash;
        setSaveStatus("saved");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load draft.");
        setSaveStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftIdFromQuery]);

  const createEditableDraft = useCallback(
    async ({
      title,
      html,
      matterId,
      templateId,
      buildReplaceUrl,
    }: {
      title: string;
      html: string;
      matterId: string | null;
      templateId: string | null;
      buildReplaceUrl: (draft: DraftDetail) => string;
    }) => {
      const context = deriveDraftContextFromMatter(selectedMatter);
      const contentJson = generateJSON(
        html,
        buildDraftingExtensions({
          definedTerms: context.definedTerms,
        }),
      );

      setSaveStatus("saving");
      setLoadError("");
      const createdDraft = await createDraft({
        title,
        matterId,
        templateId,
        contentJson,
        context,
      });
      const hash = hashDraftContent(createdDraft.contentJson || {});
      savedHashRef.current = hash;
      currentHashRef.current = hash;
      setActiveDraft(createdDraft);
      setDocumentTitle(createdDraft.title);
      setCurrentContentJson(createdDraft.contentJson || {});
      setComments([]);
      setPendingAnnotation(null);
      setActiveAnnotationId(null);
      setCommentDraft("");
      setSaveStatus("saved");
      navigate(buildReplaceUrl(createdDraft), { replace: true });
    },
    [navigate, selectedMatter],
  );

  useEffect(() => {
    if (!sourceDocumentFromQuery || draftIdFromQuery || !selectedMatter) return;

    const requestKey = `${selectedMatter.id}:${sourceDocumentFromQuery}`;
    if (sourceDraftRequestRef.current === requestKey) return;
    sourceDraftRequestRef.current = requestKey;

    const sourceDocument = selectedMatter.documentResults?.find(
      (entry) => entry.document.fileName === sourceDocumentFromQuery,
    );
    const sourceText =
      sourceDocument?.page_aware_structure?.full_text ||
      sourceDocument?.preview_text ||
      "";

    if (!sourceDocument || !sourceText.trim()) {
      setLoadError("Source document text is not available for drafting.");
      return;
    }

    const createSourceDraft = async () => {
      try {
        await createEditableDraft({
          title: `Editable source - ${sourceDocument.document.fileName}`,
          matterId: selectedMatter.id,
          templateId: "source-document",
          html: sourceTextToHtml(sourceDocument.document.fileName, sourceText),
          buildReplaceUrl: (draft) =>
            `/draft?draft=${encodeURIComponent(draft.id)}&matter=${encodeURIComponent(selectedMatter.id)}`,
        });
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to open source draft.");
      }
    };

    void createSourceDraft();
  }, [createEditableDraft, draftIdFromQuery, selectedMatter, sourceDocumentFromQuery]);

  useEffect(() => {
    if (draftIdFromQuery || sourceDocumentFromQuery || !plannerGroundFromQuery || !plannerStepFromQuery) return;

    const requestKey = `${selectedMatter?.id || "none"}:${plannerGroundFromQuery}:${plannerStepFromQuery}:${draftModeFromQuery}`;
    if (nextStepDraftRequestRef.current === requestKey) return;
    nextStepDraftRequestRef.current = requestKey;

    const planItems = Array.isArray(selectedMatter?.nextStepPlan?.items)
      ? selectedMatter?.nextStepPlan?.items
      : [];
    const groundItem = planItems.find((item) => item?.ground_id === plannerGroundFromQuery);
    const step = Array.isArray(groundItem?.recommended_next_steps)
      ? groundItem.recommended_next_steps.find((item) => item?.step_id === plannerStepFromQuery)
      : null;

    if (!selectedMatter || !groundItem || !step) {
      setSaveStatus("error");
      setLoadError("Next step details are not available for drafting.");
      return;
    }

    const createNextStepDraft = async () => {
      try {
        if (draftModeFromQuery === "template" && step.template_key) {
          const template = await getNextStepTemplate({
            matterId: selectedMatter.id,
            groundId: plannerGroundFromQuery,
            stepId: plannerStepFromQuery,
            templateKey: step.template_key,
          });

          await createEditableDraft({
            title: template?.title || step.title || groundItem.title || "Template draft",
            matterId: selectedMatter.id,
            templateId: step.template_key,
            html:
              String(template?.content_html || "").trim() ||
              sourceTextToHtml(
                template?.title || step.title || "Template draft",
                String(template?.content_text || "").trim(),
              ),
            buildReplaceUrl: (draft) =>
              `/draft?draft=${encodeURIComponent(draft.id)}&matter=${encodeURIComponent(selectedMatter.id)}`,
          });
          return;
        }

        await createEditableDraft({
          title: step.title || groundItem.title || "Scratch draft",
          matterId: selectedMatter.id,
          templateId: step.draft_type || "next-step-scratch",
          html: nextStepScratchHtml({
            title: step.title || groundItem.title || "Scratch draft",
            description: String(step.description || ""),
            reason: String(step.reason || ""),
            requiredInputs: Array.isArray(step.required_inputs) ? step.required_inputs : [],
          }),
          buildReplaceUrl: (draft) =>
            `/draft?draft=${encodeURIComponent(draft.id)}&matter=${encodeURIComponent(selectedMatter.id)}`,
        });
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to open next-step draft.");
      }
    };

    void createNextStepDraft();
  }, [
    createEditableDraft,
    draftIdFromQuery,
    draftModeFromQuery,
    plannerGroundFromQuery,
    plannerStepFromQuery,
    selectedMatter,
    sourceDocumentFromQuery,
  ]);

  useEffect(() => {
    if (draftIdFromQuery || sourceDocumentFromQuery || plannerGroundFromQuery || plannerStepFromQuery) return;

    const requestKey = selectedMatter?.id || "blank";
    if (blankDraftRequestRef.current === requestKey) return;
    blankDraftRequestRef.current = requestKey;

    const createBlankDraft = async () => {
      try {
        await createEditableDraft({
          title: selectedMatter ? `Draft - ${selectedMatter.title}` : "Untitled legal draft",
          matterId: selectedMatter?.id || null,
          templateId: "blank-document",
          html: blankDraftHtml(),
          buildReplaceUrl: (draft) =>
            `/drafting?draft=${encodeURIComponent(draft.id)}${
              selectedMatter?.id ? `&matter=${encodeURIComponent(selectedMatter.id)}` : ""
            }`,
        });
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to open blank draft.");
      }
    };

    void createBlankDraft();
  }, [createEditableDraft, draftIdFromQuery, selectedMatter, sourceDocumentFromQuery]);

  useEffect(() => {
    if (!activeDraft) return;
    setDocumentTitle(activeDraft.title);
  }, [activeDraft?.id, activeDraft?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeDraft) return;
    const trimmedTitle = documentTitle.trim() || "Untitled legal draft";
    if (trimmedTitle === activeDraft.title) return;

    const timeoutId = window.setTimeout(() => {
      void patchDraft(activeDraft.id, { title: trimmedTitle })
        .then((patchedDraft) => {
          setActiveDraft((current) =>
            current && current.id === patchedDraft.id ? { ...current, title: patchedDraft.title } : current,
          );
        })
        .catch(() => {
          // Save flow will retry title persistence even if the debounce patch fails.
        });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeDraft, documentTitle]);

  const updateCurrentDocument = (contentJson: JSONContent) => {
    setCurrentContentJson(contentJson);
    currentHashRef.current = hashDraftContent(contentJson);
    if (saveStatus !== "saving" && saveStatus !== "loading") {
      setSaveStatus(
        currentHashRef.current === savedHashRef.current && documentTitle.trim() === activeDraft?.title
          ? "saved"
          : "dirty",
      );
    }
  };

  const saveCurrentDraft = useCallback(
    async (saveReason: "autosave" | "manual") => {
      if (!activeDraft) return;

      const nextTitle = documentTitle.trim() || "Untitled legal draft";
      setSaveStatus("saving");
      try {
        const savedDraft = await saveDraft({
          draftId: activeDraft.id,
          title: nextTitle,
          contentJson: currentContentJson,
          context: activeDraft.context,
          saveReason,
        });
        setActiveDraft(savedDraft);
        setDocumentTitle(savedDraft.title);
        savedHashRef.current = hashDraftContent(savedDraft.contentJson || {});
        currentHashRef.current = savedHashRef.current;
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to save draft.");
      }
    },
    [activeDraft, currentContentJson, documentTitle],
  );

  useEffect(() => {
    if (!activeDraft) return;

    const intervalId = window.setInterval(() => {
      const titleDirty = (documentTitle.trim() || "Untitled legal draft") !== activeDraft.title;
      const contentDirty = currentHashRef.current !== savedHashRef.current;
      if (!titleDirty && !contentDirty) return;
      void saveCurrentDraft("autosave");
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeDraft, documentTitle, saveCurrentDraft]);

  useEffect(() => {
    if (!activeDraft?.id || reviewStatus !== "running") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const reviewJob = await getDraftReview(activeDraft.id);
        if (cancelled) return;
        if (reviewJob.status === "completed") {
          setComments(
            Array.isArray(reviewJob.result?.annotations)
              ? reviewJob.result.annotations
              : [],
          );
          setReviewStatus("ready");
          return;
        }
        if (reviewJob.status === "failed") {
          setReviewStatus("error");
          setLoadError(reviewJob.error || "Draft review failed.");
          return;
        }
        window.setTimeout(() => {
          void poll();
        }, 2000);
      } catch (error) {
        if (cancelled) return;
        setReviewStatus("error");
        setLoadError(error instanceof Error ? error.message : "Draft review failed.");
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [activeDraft?.id, reviewStatus]);

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.applyCommand(command, value);
  };

  const runDraftReview = async () => {
    if (!activeDraft) return;
    setReviewStatus("running");
    setLoadError("");
    try {
      await saveCurrentDraft("manual");
      await triggerDraftReview(activeDraft.id);
    } catch (error) {
      setReviewStatus("error");
      setLoadError(error instanceof Error ? error.message : "Failed to run draft review.");
    }
  };

  const changeFontSize = (delta: number) => {
    const nextSize = Math.min(120, Math.max(8, toolbarState.fontSize + delta));
    applyCommand("fontSize", `${nextSize}px`);
  };

  const setFontSizeDirectly = (rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const nextSize = Math.min(120, Math.max(8, rawValue));
    applyCommand("fontSize", `${nextSize}px`);
  };

  const addPendingComment = () => {
    if (!pendingAnnotation || pendingAnnotation.type !== "comment" || !commentDraft.trim()) {
      return;
    }

    setComments((prev) => [
      {
        id: crypto.randomUUID(),
        author: "You",
        excerpt: pendingAnnotation.excerpt,
        note: commentDraft.trim(),
        type: "comment",
        from: pendingAnnotation.from,
        to: pendingAnnotation.to,
        status: "pending",
        replies: [],
      },
      ...prev,
    ]);
    setCommentDraft("");
    setPendingAnnotation(null);
  };

  const addReaction = (emoji: string) => {
    if (!pendingAnnotation || pendingAnnotation.type !== "reaction") {
      return;
    }

    const commentId = crypto.randomUUID();
    setComments((prev) => [
      {
        id: commentId,
        author: "You",
        excerpt: pendingAnnotation.excerpt,
        note: emoji,
        type: "reaction",
        from: pendingAnnotation.from,
        to: pendingAnnotation.to,
        status: "pending",
        replies: [],
      },
      ...prev,
    ]);
    setActiveAnnotationId(commentId);
    setPendingAnnotation(null);
  };

  const updateCommentStatus = (id: string, status: DraftComment["status"]) => {
    setComments((prev) =>
      prev.map((comment) => (comment.id === id ? { ...comment, status } : comment)),
    );
  };

  const updateCommentNote = (id: string, note: string) => {
    setComments((prev) =>
      prev.map((comment) => (comment.id === id ? { ...comment, note } : comment)),
    );
  };

  const deleteComment = (id: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== id));
    setActiveAnnotationId((current) => (current === id ? null : current));
  };

  const addCommentReply = (id: string, note: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === id
          ? {
              ...comment,
              replies: [
                ...comment.replies,
                {
                  id: crypto.randomUUID(),
                  author: "You",
                  note,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : comment,
      ),
    );
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "dirty"
        ? "Unsaved changes"
        : saveStatus === "error"
          ? "Save failed"
          : "Saved to Associate Drive";

  const canRenderEditor = Boolean(activeDraft);

  return (
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
        draftingChrome={
          canRenderEditor
            ? {
                documentTitle,
                saveStatusLabel,
                currentRole,
                requestEditPending,
                canUndo: toolbarState.canUndo,
                canRedo: toolbarState.canRedo,
                isBoldActive: toolbarState.isBoldActive,
                isItalicActive: toolbarState.isItalicActive,
                isUnderlineActive: toolbarState.isUnderlineActive,
                isStrikeActive: toolbarState.isStrikeActive,
                isHighlightActive: toolbarState.isHighlightActive,
                isAlignLeftActive: toolbarState.isAlignLeftActive,
                isAlignCenterActive: toolbarState.isAlignCenterActive,
                isAlignRightActive: toolbarState.isAlignRightActive,
                isAlignJustifyActive: toolbarState.isAlignJustifyActive,
                isBulletListActive: toolbarState.isBulletListActive,
                isOrderedListActive: toolbarState.isOrderedListActive,
                onDocumentTitleChange: (value: string) => {
                  setDocumentTitle(value);
                  setSaveStatus("dirty");
                },
                onRequestEdit: () => setRequestEditPending(true),
                zoomLevel,
                onZoomChange: setZoomLevel,
                paragraphStyle: toolbarState.paragraphStyle,
                onParagraphStyleChange: (nextStyle: ParagraphStyle) =>
                  applyCommand("formatBlock", styleMap[nextStyle]),
                fontFamily: toolbarState.fontFamily,
                fontFamilies: FONT_FAMILIES,
                onFontFamilyChange: (value: string) => applyCommand("fontName", value),
                fontSize: toolbarState.fontSize,
                onDecreaseFontSize: () => changeFontSize(-2),
                onIncreaseFontSize: () => changeFontSize(2),
                onFontSizeChange: setFontSizeDirectly,
                colorChoices: COLOR_CHOICES,
                onUndo: () => applyCommand("undo"),
                onRedo: () => applyCommand("redo"),
                onPrint: () => window.print(),
                onBold: () => applyCommand("bold"),
                onItalic: () => applyCommand("italic"),
                onUnderline: () => applyCommand("underline"),
                onStrike: () => applyCommand("strike"),
                onHighlight: () => applyCommand("hiliteColor", "#fff0b8"),
                onSetTextColor: (color: string) => applyCommand("foreColor", color),
                onInsertLink: () => editorRef.current?.insertLink(),
                onInsertImage: () => editorRef.current?.insertImage(),
                onInsertTable: () => editorRef.current?.insertTable(),
                onOpenCommentComposer: () => editorRef.current?.startCommentSelection(),
                onOpenFindReplace: () => editorRef.current?.openFindReplace(),
                onRunReview: () => void runDraftReview(),
                onAlignLeft: () => applyCommand("justifyLeft"),
                onAlignCenter: () => applyCommand("justifyCenter"),
                onAlignRight: () => applyCommand("justifyRight"),
                onAlignJustify: () => applyCommand("justifyFull"),
                onBulletList: () => applyCommand("insertUnorderedList"),
                onNumberList: () => applyCommand("insertOrderedList"),
                onOutdent: () => applyCommand("outdent"),
                onIndent: () => applyCommand("indent"),
                onManualSave: () => void saveCurrentDraft("manual"),
              }
            : undefined
        }
      />

      <main
        className={`homeDashMain ${
          canRenderEditor ? "draftingMain" : "draftingTemplateMain"
        } draftingNoAppSidebar`}
      >
        {activeDraft ? (
          <DraftingDocument
            ref={editorRef}
            draft={activeDraft}
            currentRole={currentRole}
            zoomLevel={zoomLevel}
            activeAnnotationId={activeAnnotationId}
            pendingAnnotation={pendingAnnotation}
            commentDraft={commentDraft}
            comments={comments}
            onDocumentChange={updateCurrentDocument}
            onToolbarStateChange={setToolbarState}
            onCommentDraftChange={setCommentDraft}
            onStartAnnotation={(annotation) => {
              setPendingAnnotation(annotation);
              setCommentDraft("");
              setActiveAnnotationId(null);
            }}
            onClearPendingAnnotation={() => {
              setPendingAnnotation(null);
              setCommentDraft("");
            }}
            onAddPendingComment={addPendingComment}
            onAddReaction={addReaction}
            onSelectAnnotation={setActiveAnnotationId}
            onAcceptComment={(id) => updateCommentStatus(id, "accepted")}
            onRejectComment={(id) => updateCommentStatus(id, "rejected")}
            onUpdateComment={updateCommentNote}
            onDeleteComment={deleteComment}
            onAddReply={addCommentReply}
            onMapComments={setComments}
            onRequestSave={() => void saveCurrentDraft("manual")}
          />
        ) : (
          <section className="draftBlankLoading">
            <p className="draftTemplateEyebrow">Drafting Suite</p>
            <h1>{saveStatus === "error" ? "Unable to open draft" : "Opening document"}</h1>
            <p>{loadError || "Preparing an editable document workspace."}</p>
          </section>
        )}
      </main>
    </div>
  );
};

export default DraftingPage;
