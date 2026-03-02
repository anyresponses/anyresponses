import SiteHeader from "../components/SiteHeader";
import ModelsExplorer from "./ModelsExplorer";

export default function ModelsPage() {
  return (
    <div className="page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content">
        <section className="section" id="catalog">
          <div className="section-block section-block-plain">
            <div className="section-heading">
              <h2>Model catalog. (BUILT-IN)</h2>
              <p>
                The models below are available without BYOK or custom API keys.
                If you bring your own key (BYOK) or configure a provider via the
                SDK, you can access the full model catalog offered by that
                provider.
              </p>
            </div>
            <ModelsExplorer />
          </div>
        </section>
      </main>
    </div>
  );
}
