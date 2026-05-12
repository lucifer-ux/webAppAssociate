import "../componentStyling/Loader.css";

type LoaderProps = {
  fileName?: string;
  message?: string;
};

const PROCESSING_STEPS = [
  "Ingesting case files...",
  "Extracting key entities (Plaintiff, Respondent, Counsel)...",
  "Indexing chronological events for timeline generation...",
  "Identifying potential legal contradictions...",
];

const Loader = ({ fileName, message }: LoaderProps) => {
  return (
    <div className="matterUploadLoader" role="status" aria-live="polite">
      <div className="matterUploadLoaderFrame">
        <section className="matterUploadLoaderContent">
          <p className="matterUploadLoaderEyebrow">Matter Upload</p>
          <h2>Processing Matter</h2>
          <p className="matterUploadLoaderLead">
            {message ||
              "Preparing your matter workspace. This usually takes a moment."}
          </p>

          <div className="matterUploadLoaderProgress" aria-hidden="true">
            <span className="matterUploadLoaderProgressBar" />
          </div>

          <div className="matterUploadLoaderSteps">
            {PROCESSING_STEPS.map((step, index) => {
              const state =
                index < 2 ? "done" : index === 2 ? "active" : "upcoming";

              return (
                <div
                  key={step}
                  className={`matterUploadLoaderStep matterUploadLoaderStep${state[0].toUpperCase()}${state.slice(1)}`}
                >
                  <span className="matterUploadLoaderStepIcon" aria-hidden="true">
                    {state === "done" ? "○" : state === "active" ? "↺" : "○"}
                  </span>
                  <span className="matterUploadLoaderStepText">{step}</span>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="matterUploadLoaderPreview" aria-hidden="true">
          <div className="matterUploadLoaderSheet matterUploadLoaderSheetBack">
            <div className="matterUploadLoaderLine matterUploadLoaderLineShort" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineTiny" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineMedium" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineWide" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineWide" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineMedium" />
          </div>
          <div className="matterUploadLoaderSheet matterUploadLoaderSheetFront">
            <div className="matterUploadLoaderDivider" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineWide" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineWide" />
            <div className="matterUploadLoaderLine matterUploadLoaderLineMedium" />
            <div className="matterUploadLoaderFileChip">
              <span className="matterUploadLoaderFileDot" />
              <span>{fileName || "Matter brief.pdf"}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Loader;
