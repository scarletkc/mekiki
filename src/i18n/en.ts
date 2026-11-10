/**
 * English, the default locale. This file defines the dictionary shape: the
 * other locales are type-checked against it, so a missing key fails
 * `pnpm check`. `{name}` placeholders are filled by `fmt()` from ./fmt.
 */
export const en = {
  meta: {
    tagline: 'AI model ratings',
    description:
      'Personal ratings of AI models: intelligence, cost and value, with a public JSON API.',
  },
  nav: {
    models: 'Models',
    method: 'Method',
    api: 'API',
    github: 'GitHub',
    language: 'Language',
    main: 'Main',
    skip: 'Skip to content',
  },
  theme: {
    toggle: 'Switch between dark and light',
  },
  rating: {
    intelligence: 'Intelligence',
    cost: 'Cost',
    value: 'Value',
  },
  tier: {
    intelligence: { top: 'Top', high: 'High', mid: 'Mid', low: 'Low' },
    cost: { low: 'Low', mid: 'Mid', high: 'High', very_high: 'Very high' },
    value: { top: 'Top', high: 'High', mid: 'Mid', low: 'Low' },
  },
  empty: {
    unrated: 'Not rated',
    noData: 'No data',
    noPrice: 'No price',
    free: 'Free',
  },
  badge: {
    legacy: 'Legacy',
    openWeights: 'Open weights',
  },
  home: {
    title: 'Models',
    intro:
      'Every model gets three ratings. Intelligence comes from public leaderboards; cost and value follow from the price.',
  },
  table: {
    columns: {
      model: 'Model',
      vendor: 'Vendor',
      intelligence: 'Intelligence',
      cost: 'Cost',
      value: 'Value',
      price: 'Input / output price',
    },
    priceNote: 'Prices in USD per 1M tokens',
    search: 'Search models by name',
    filters: 'Filters',
    vendor: 'Vendor',
    weights: 'Weights',
    all: 'All',
    open: 'Open',
    closed: 'Closed',
    showLegacy: 'Show {n} legacy models',
    hideLegacy: 'Hide legacy models',
    reset: 'Clear filters',
    count: '{shown} of {total} models',
    noResults: 'No models match these filters.',
    sortBy: 'Sort by {column}',
    sortedAsc: 'ascending',
    sortedDesc: 'descending',
    caption: 'AI model ratings',
  },
  detail: {
    back: 'All models',
    breakdown: 'How the intelligence score is built',
    metricCol: 'Metric',
    raw: 'Raw',
    frontier: 'Leader',
    normalized: 'Normalised',
    weight: 'Weight',
    scoreNote: 'Intelligence is the weighted mean of the normalised leaderboard scores above.',
    unratedNote: "This model isn't on any of these leaderboards yet, so it isn't rated.",
    notMapped: 'No mapping set',
    notFound: 'Not in the snapshot',
    facts: 'Facts',
    price: 'Price',
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    blended: 'Blended',
    blendedUnit: 'Blended, USD per 1M tokens',
    priceNote:
      'Prices are in USD per 1M tokens. The blended price assumes {hit}% of input tokens are cache hits, then weights input and output {input}:{output}.',
    priceOverride: 'Price entered by hand; the models.dev figure is not used.',
    costIndex: 'Cost index',
    context: 'Context window',
    tokens: '{n} tokens',
    releaseDate: 'Released',
    weights: 'Weights',
    open: 'Open',
    closed: 'Closed',
    modalities: 'Modalities',
    modalityIn: 'In',
    modalityOut: 'Out',
    indexCost: 'Cost to run the AA Intelligence Index',
    indexCostNote: 'For reference only; not part of the score.',
    links: 'Source data',
    linkModelsdev: 'models.dev',
    linkAa: 'Artificial Analysis model page',
    linkJson: "This model's JSON",
  },
  metric: {
    aa_intelligence: 'AA Intelligence Index',
    arena_text: 'Arena text',
    arena_webdev: 'Arena WebDev',
  },
  method: {
    title: 'Method',
    intro:
      'Every model gets three ratings: intelligence, cost and value. The weights and thresholds below are read straight from the scoring config, so this page changes when the config does.',
    intelligenceTitle: 'Intelligence',
    intelligenceBody:
      'Each leaderboard metric is first normalised to 0–100, where 100 is the current leader on that metric. Index-style metrics start at 0; Elo-style metrics only use a fixed range below the leader, listed in the table.',
    benchmarkBody:
      'The intelligence score is the weighted mean of the metrics a model has. A missing metric is left out and the remaining weights are re-normalised; a model on none of the leaderboards is not rated.',
    weightsCaption: 'Benchmark metrics and weights',
    source: 'Source',
    floor: 'Zero point',
    floorAbsolute: 'Raw score {value}',
    floorBelowFrontier: 'Leader − {gap}',
    costTitle: 'Cost',
    costBody:
      'Prices are the official ones from models.dev, in USD per 1M tokens. Assuming {hit}% of input tokens are cache hits, effective input = {hitRate} × cache read + {missRate} × input. A model without a cache-read price pays the full input price, and cache-write surcharges are not counted. Blended price = ({input} × effective input + {output} × output) ÷ {total}. Tiers are set by the absolute blended price.',
    costIndexBody:
      'The cost index is only used to compute value: the blended price between ${floor} and ${ceil} is mapped to 0–100 on a log scale, and anything at or below ${floor} is 0.',
    valueTitle: 'Value',
    valueBody:
      'Value = intelligence^{a} × max(100 − cost index, {min})^{b}. This is a geometric mean, so neither side can be terrible: smart but very expensive, or cheap but dim, both score low.',
    tiersTitle: 'Tiers',
    tiersCaption: 'Tier conditions for each rating',
    tierRating: 'Rating',
    tierConditions: 'Tiers and conditions',
    blendedShort: 'blended',
    sourcesTitle: 'Data sources and attribution',
    sourcesBody:
      'A scheduled job syncs external data into snapshot files. The site build only reads those files and never goes online.',
    sourcesCaption: 'Data sources and when they were last updated',
    sourceName: 'Source',
    sourceUse: 'Used for',
    sourceLicense: 'Licence',
    sourceUpdated: 'Data updated',
    useModelsdev: 'Price, context window, release date, open weights, modalities',
    useAa: 'Intelligence Index, cost to run the index',
    useArena: 'Text and WebDev leaderboard ratings',
    licenseAa: 'Attribution per its terms',
    caveatsTitle: 'Caveats',
    caveatAaCoding:
      "Coding ability is measured by Arena's WebDev board. Artificial Analysis also publishes a Coding Index, but its free API doesn't include it, so it isn't used.",
    caveatVariants:
      'Leaderboards often list one model several times, once per reasoning level. The entry used here is the level mekiki actually uses.',
  },
  api: {
    title: 'API',
    intro:
      'All data is published as static JSON, regenerated on every build. No key needed, and cross-origin requests are allowed.',
    endpointsTitle: 'Endpoints',
    endpointsCaption: 'API endpoints',
    path: 'Path',
    content: 'Returns',
    endpointFull: 'Everything: metadata and the full rating of every model',
    endpointList: 'Model list: id, name, vendor, status',
    endpointOne: 'One model, in the same shape as an item of the full dump',
    exampleTitle: 'Example',
    exampleBody: 'This is the live response for {id}.',
    fieldsTitle: 'Fields',
    fieldScores:
      'Scores have one decimal place. Missing values are null; fields are never omitted.',
    fieldTier:
      'tier is a stable English key. label is the English label, and labels holds the label in every language.',
    fieldPrice:
      'Prices are in USD per 1M tokens. cost.blended is the blended price, with the assumed cache hits already counted (see Method), and cost.index is the 0–100 cost index.',
    versionTitle: 'Versioning',
    versionBody:
      'Fields are only ever added. A breaking change bumps version. The current version is {version}.',
    attributionTitle: 'Attribution',
    attributionBody:
      'Leaderboard data comes from Artificial Analysis and Arena; prices come from models.dev. Credit them too if you republish these numbers.',
  },
  footer: {
    sources: 'Data from ',
    synced: 'Last synced ',
    never: 'never',
    built: 'Page built',
    repo: 'Source',
    arenaLicense: 'Arena leaderboard data used under CC BY 4.0',
    listSeparator: ', ',
    fullStop: '. ',
  },
  notFound: {
    title: "This page doesn't exist",
    body: "The link may be out of date, or the model isn't on the list.",
    home: 'Back to all models',
  },
};

export type Dictionary = typeof en;
