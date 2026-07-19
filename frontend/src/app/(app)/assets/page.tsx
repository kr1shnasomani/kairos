// Assets list — the canonical asset registry every piece of knowledge attaches to.
import { getAssets } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/ui";
import { StatPills, type StatPillDef } from "@/components/stat-pills";
import { AssetRegistry } from "./asset-registry";
import { IdentityConfirmAction } from "./identity-action";

export default async function AssetsPage() {
  const { data, source } = await getAssets();
  // Live-only: never render fixtures. A fallback means the backend is unreachable →
  // surface the shared error boundary (Try again) instead of fabricated assets.
  if (source === "demo") throw new Error("Assets: live data unavailable");
  const items = data.items ?? [];

  // Spec §3: pills by equipment class — total plus the top classes by count.
  const byClass = new Map<string, number>();
  for (const a of items) byClass.set(a.equipment_class, (byClass.get(a.equipment_class) ?? 0) + 1);
  const classPills: StatPillDef[] = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, value]) => ({ key: label, label, value }));

  return (
    <div data-testid="assets-workspace" className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Asset-centric truth"
        title="Assets"
        lede="Every piece of knowledge orbits a canonical asset."
        actions={
          <>
            <IdentityConfirmAction />
          </>
        }
      />

      <section data-testid="assets-summary" className="mt-5">
        <StatPills pills={[{ key: "total", label: "Registered", value: data.total ?? items.length }, ...classPills]} />
      </section>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No assets bootstrapped" action={{ label: "Bootstrap assets", href: "/assets/bootstrap" }} />
        </div>
      ) : (
        <AssetRegistry assets={items} />
      )}
    </div>
  );
}
