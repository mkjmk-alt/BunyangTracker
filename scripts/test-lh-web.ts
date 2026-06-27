import { LHWebProvider } from "../lib/sources/lh-web";

async function main() {
  console.log("=== LH Web Scraper Test ===\n");

  const provider = new LHWebProvider();
  const items = await provider.fetchIndex({ perPage: 100 });

  console.log(`\nTotal fetched: ${items.length}`);

  if (items.length > 0) {
    console.log("\nFirst 3 raw items:");
    for (const item of items.slice(0, 3)) {
      console.log(JSON.stringify(item, null, 2));
    }

    console.log("\nFirst 3 normalized:");
    for (const item of items.slice(0, 3)) {
      console.log(JSON.stringify(provider.normalize(item), null, 2));
    }

    // Count by type
    const byType = items.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log("\nBy type:", byType);

    // Count by mi
    const byMi = items.reduce((acc, i) => {
      const label = i.mi === "1026" ? "임대" : "분양";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log("By category:", byMi);
  }
}

main().catch(console.error);
