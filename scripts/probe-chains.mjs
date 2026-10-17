// One-off probe: what each truck service chain's locator exposes (sitemaps, JSON feeds). Prints short hints only.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const SITES = {
  rush: ["https://www.rushtruckcenters.com/robots.txt", "https://www.rushtruckcenters.com/locations"],
  peterbilt: ["https://www.peterbilt.com/robots.txt", "https://www.peterbilt.com/dealer-locator"],
  kenworth: ["https://www.kenworth.com/robots.txt", "https://www.kenworth.com/dealers/"],
  mack: ["https://www.macktrucks.com/robots.txt", "https://www.macktrucks.com/dealer-locator/", "https://dealerlocator.macktrucks.com/Mack_DealerJson.ashx"],
  international: ["https://www.international.com/robots.txt", "https://www.international.com/dealer-locator"],
  cummins: ["https://locator.cummins.com/robots.txt", "https://locator.cummins.com/"],
  goodyear: ["https://www.goodyeartrucktires.com/robots.txt", "https://www.goodyeartrucktires.com/dealer-locator/"],
  gcr: ["https://www.gcrtires.com/robots.txt", "https://www.gcrtires.com/locations"],
  pomps: ["https://www.pompstire.com/robots.txt", "https://www.pompstire.com/locations"],
  purcell: ["https://www.purcelltire.com/robots.txt", "https://www.purcelltire.com/locations"],
  tci: ["https://www.tcitire.com/robots.txt", "https://www.tcitire.com/locations"],
};
const hint = (s) => [...new Set([...s.matchAll(/(?:https?:)?\/\/[^"'\s<>]*(?:sitemap[^"'\s<>]*|api[^"'\s<>]*|\.ashx[^"'\s<>]*|json[^"'\s<>]*)/gi)].map((m) => m[0]))].slice(0, 12);
for (const [k, urls] of Object.entries(SITES)) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow" });
      const t = await r.text();
      const locs = [...new Set([...t.matchAll(/href="([^"]*(?:location|dealer|branch|store)s?\/[^"#?]{3,})"/gi)].map((m) => m[1]))];
      console.log(`${k} ${u} -> ${r.status} ${r.url !== u ? "(" + r.url + ") " : ""}${t.length}b links:${locs.length} ${locs.slice(0, 3).join(" ")}`);
      if (u.endsWith("robots.txt")) console.log("   ", t.split("\n").filter((l) => /sitemap|disallow/i.test(l)).slice(0, 8).join(" | "));
      else console.log("   hints:", hint(t).join(" "), "| starts:", t.slice(0, 120).replace(/\s+/g, " "));
    } catch (e) { console.log(k, u, "ERR", e.message); }
  }
}
