import "../componentStyling/Loader.css";

type LoaderProps = {
  fileName?: string;
  message?: string;
  progress?: number;
  stage?: string;
  steps?: string[];
};

const Loader = ({ fileName, message, progress = 0, stage, steps = [] }: LoaderProps) => {
  const visibleSteps = steps.length
    ? steps.slice(-4)
    : [stage || "Queued matter ingestion"];

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
          <div className="matterUploadLoaderStatusRow">
            <strong>{stage || "Queued matter ingestion"}</strong>
            <span>{Math.max(0, Math.min(100, Math.round(progress)))}%</span>
          </div>

          <div className="matterUploadLoaderProgress" aria-hidden="true">
            <span
              className="matterUploadLoaderProgressBar"
              style={{ width: `${Math.max(10, Math.min(100, progress || 10))}%` }}
            />
          </div>

          <div className="matterUploadLoaderSteps">
            {visibleSteps.map((step, index) => {
              const state =
                index === visibleSteps.length - 1 ? "active" : "done";

              return (
                <div
                  key={`${step}-${index}`}
                  className={`matterUploadLoaderStep matterUploadLoaderStep${state[0].toUpperCase()}${state.slice(1)}`}
                >
                  <span className="matterUploadLoaderStepIcon" aria-hidden="true">
                    {state === "done" ? "○" : "↺"}
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
