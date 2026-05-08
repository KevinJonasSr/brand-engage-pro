export type Brand = {
  slug: string;
  name: string;
  tagline: string;
  bio: string;
  heroImage: string | null; // fill when Box assets land
  /** Focal-point x coord 0..100; falls back to 50 when not set. */
  heroFocalX?: number;
  /** Focal-point y coord 0..100; falls back to 50 when not set. */
  heroFocalY?: number;
  accentFrom: string; // CSS color literal (e.g. "#f43f5e")
  accentTo: string; // CSS color literal (e.g. "#fbbf24")
  genres: string[];
  upcoming: {
    /** DB-backed event id. Optional for legacy hardcoded fallback entries. */
    id?: string;
    title: string;
    detail: string;
    date: string;
    capacity?: number | null;
    location?: string | null;
    url?: string | null;
    /**
     * Phase 5d: access tier for this event. DB events carry their row's
     * `tier` column ('public' | 'premium'); legacy hardcoded fallback
     * entries leave this undefined and are treated as public.
     */
    tier?: "public" | "premium";
  }[];
  merch: { title: string; tier: string; points: string }[];
  social: { label: string; href: string }[];
};

// Placeholder content for each brand — swap when Box assets are delivered.
// Keep keys stable; marketing can paste final copy here without touching layout.
export const BRANDS: Record<string, Brand> = {
  "jonas-group-ent": {
    slug: "jonas-group-ent",
    name: "Jonas Group Entertainment",
    tagline: "Songwriters, artists, catalog. Music Row, Nashville.",
    bio: [
      "Jonas Group Entertainment is a full-service entertainment company on Nashville's historic Music Row, owned by the Jonas family. We are a label, a publisher, an artist-management group, and a steward of some of the most influential catalogs in country and pop.",
      "Under our roof: Red Van Records (label), Jonas Group Publishing (songwriter representation and catalog), and a management roster that includes Rhett Akins, Aaron Gillespie, Levi Hummon, RaeLynn, Bailee Madison, Franklin Jonas, Justin Ebach, David Kalmusky, Hunter Hawkins, Amy Stroup, and Dan Marshall. Jonas Group Publishing champions Music Row catalogs through signings, acquisitions, and sync — including the acquired Jonas Brothers catalog.",
      "This page is for the people who've been on our list for years — fans of the artists, friends of the family, and members of the broader Jonas universe. Members get early ticket access for roster shows, listening-party invites, and signed lyric sheets and catalog vinyl from the rewards store. Founders get a private guided tour of our Music Row house at 1600 17th Ave South.",
    ].join("\n\n"),
    heroImage: "/brands/jonas-group-ent/hero.png",
    accentFrom: "#0a0a0a",
    accentTo: "#525252",
    genres: ["All genres", "Country", "Pop", "Rock", "Americana"],
    upcoming: [
      {
        title: "New-Release Listening Party — Spring Drop",
        detail: "Virtual listening party for an upcoming JGP release. Artist joins for Q&A.",
        date: "Thursday, May 21 · 7 PM CT",
        location: "Virtual (member-only link)",
      },
      {
        title: "Songwriter Round at the Music Row House",
        detail: "Three writers, acoustic guitars, the stories behind the cuts.",
        date: "Saturday, June 20 · 7 PM CT",
        location: "1600 17th Ave South, Nashville TN",
        tier: "premium",
      },
    ],
    merch: [
      { title: "Signed Lyric Sheet (Roster Pick)", tier: "Bronze+", points: "1,800 pts" },
      { title: "Catalog Vinyl Pressing", tier: "Silver+", points: "3,200 pts" },
    ],
    social: [
      { label: "Instagram", href: "https://www.instagram.com/jonasgroupent/" },
      { label: "Facebook", href: "https://www.facebook.com/jonasgroupent" },
      { label: "Website", href: "https://www.jonasgroup.com/" },
    ],
  },
  nellies: {
    slug: "nellies",
    name: "Nellie's Southern Kitchen",
    tagline: "It feels good to be home.",
    bio: [
      "Nellie's Southern Kitchen is a love letter to Nellie Jonas — a Belmont woman, a working cook, a host who believed nobody should leave the table hungry. She lived on Main Street until 2011, and her recipes, her hospitality, and her stubborn insistence on the perfect biscuit are the foundation of everything we serve.",
      "We opened the doors in June 2016 at 36 N. Main, a few blocks from where she used to live. The food is the food she made: chicken 'n' dumplings, drunken collard greens, shrimp and grits, fried chicken on a Sunday. Made in-house. Never frozen.",
      "The dining room is loud on purpose. Our servers sing — actually sing, with a band, on weekend nights. There's a hallway in the back lined with platinum records and family photos — proof that Belmont raised more than one Jonas, and proof that no matter how far you go, you come home for the biscuits.",
      'Featured in Charlotte Magazine\'s "25 Best New Restaurants" and the Chicago Tribune\'s 7 must-visit Southern restaurants. Come hungry.',
    ].join("\n\n"),
    heroImage: "/brands/nellies/hero-sign.jpg",
    accentFrom: "#1f2937",
    accentTo: "#d4a857",
    genres: ["Southern", "Soul food", "Family-style"],
    upcoming: [
      {
        title: "Sunday Supper Series — Live Band Night",
        detail: "Family-style supper and a live country/Americana band.",
        date: "Sunday, May 17 · 6 PM",
        location: "36 N. Main St., Belmont NC",
      },
      {
        title: "Biscuit-Making Class with the Kitchen",
        detail: "Hands-on class with our pastry team. Apron + recipe card to take home.",
        date: "Saturday, June 13 · 10 AM",
        location: "Nellie's Southern Kitchen, Belmont NC",
        tier: "premium",
      },
    ],
    merch: [
      { title: "Nellie's Apron + Recipe Card", tier: "Bronze+", points: "1,500 pts" },
      { title: "House Hot Sauce 3-Pack", tier: "Silver+", points: "2,200 pts" },
    ],
    social: [
      { label: "Instagram", href: "https://www.instagram.com/nelliessouthernkitchen/" },
      { label: "Facebook", href: "https://www.facebook.com/nelliessouthernkitchen" },
      { label: "Website", href: "https://www.nelliessouthernkitchen.com/" },
      { label: "OpenTable", href: "https://www.opentable.com/nellies-southern-kitchen" },
    ],
  },
  raelynn: {
    slug: "raelynn",
    name: "RaeLynn",
    tagline: "Country, heart-first.",
    bio: "Placeholder bio — awaiting final copy from marketing.",
    heroImage: null,
    accentFrom: "#f43f5e",
    accentTo: "#fbbf24",
    genres: ["Country", "Americana"],
    upcoming: [
      { title: "Nashville Listening Party", detail: "Brand Engage Pro members only", date: "Coming soon" },
    ],
    merch: [
      { title: "Signed Vinyl Variant", tier: "Silver Priority", points: "3,200 pts" },
      { title: "Tour Hoodie", tier: "Bronze+", points: "2,400 pts" },
    ],
    social: [{ label: "Instagram", href: "https://instagram.com/raelynn" }],
  },
  bailee: {
    slug: "bailee",
    name: "Bailee",
    tagline: "Rising voice, no ceiling.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#8b5cf6",
    accentTo: "#e879f9",
    genres: ["Pop"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Debut EP Bundle", tier: "Bronze+", points: "1,800 pts" }],
    social: [],
  },
  blake: {
    slug: "blake",
    name: "Blake",
    tagline: "Studio-raw, stadium-ready.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#0ea5e9",
    accentTo: "#34d399",
    genres: ["Country", "Rock"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Tour Poster Set", tier: "Bronze+", points: "1,200 pts" }],
    social: [],
  },
  konnor: {
    slug: "konnor",
    name: "Konnor",
    tagline: "New-school songwriting.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#f59e0b",
    accentTo: "#fb923c",
    genres: ["Pop", "Indie"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Signed Lyric Print", tier: "Silver+", points: "2,800 pts" }],
    social: [],
  },
  dan: {
    slug: "dan",
    name: "Dan",
    tagline: "Heartland heart, modern punch.",
    bio: "Placeholder bio — awaiting assets from Box drop.",
    heroImage: null,
    accentFrom: "#64748b",
    accentTo: "#60a5fa",
    genres: ["Country"],
    upcoming: [{ title: "TBD", detail: "Dates to come", date: "—" }],
    merch: [{ title: "Tour Tee", tier: "Bronze+", points: "1,400 pts" }],
    social: [],
  },
};

export function getBrand(slug: string): Brand | null {
  return BRANDS[slug.toLowerCase()] ?? null;
}

export function listBrands(): Brand[] {
  return Object.values(BRANDS);
}
