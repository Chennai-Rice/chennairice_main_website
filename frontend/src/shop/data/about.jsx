// About page content — deliberately terse. Four layouts, minimal words.

export const SCALE = {
  // Written for the scroll reveal: one continuous sentence, no line breaks, so
  // the words uncover in reading order as the section scrolls past.
  statement: "From Paddy to Perfection, A Legacy in Every Grain",
  // `to` drives the count-up; `suffix`/`prefix` are rendered around it
  figures: [
    { to: 1000, suffix: "+", unit: "Tonnes / day", label: "Paddy processed" },
    { to: 5, suffix: "", unit: "States", label: "Procurement network" },
    { to: 6, suffix: "", unit: "Locations", label: "Warehouses in Tamil Nadu" },
    { to: 1000, suffix: "+", unit: "People", label: "Across the value chain" }
  ],
  chain: ["Procurement", "Storage", "Processing", "Quality", "Packaging", "Distribution"]
};

export const CTA = {
  heading: ["1,000+ People.", "One Common Purpose."],
  paragraphs: [
    "Behind every tonne processed, every shipment delivered, and every market served is a team of people making it happen.",
    "Chennai Rice Industries has a 1,000+ strong workforce working across procurement, production, quality control, logistics, sales, operations, administration, and marketing.",
    "Our teams bring together industry experience, operational knowledge, technical capabilities, and a shared focus on performance.",
    "Because infrastructure creates capacity."
  ]
};
