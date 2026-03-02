import SiteHeader from "../components/SiteHeader";
import providersData from "../../data/providers.json";
import ProviderCard from "./ProviderCard";

const providers = providersData.providers;

export default function ProvidersPage() {
  return (
    <div className="page">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <SiteHeader />

      <main className="content">
        <section className="section" id="providers">
          <div className="section-block section-block-plain">
            <div className="section-heading">
              <h2>Providers.</h2>
              <p>Browse every provider configured in AnyResponses.</p>
            </div>
            <div className="grid grid-2 providers-grid">
              {providers.map((provider) => (
                <ProviderCard provider={provider} key={provider.id} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
