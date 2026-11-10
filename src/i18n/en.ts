/**
 * English, the default locale. This file defines the dictionary shape: the
 * other locales are type-checked against it, so a missing key fails
 * `pnpm check`. `{name}` placeholders are filled by `fmt()` from ./fmt.
 */
export const en = {
  meta: {
    tagline: 'AI model ratings',
    description:
      'AI models rated on intelligence, cost and value from public leaderboards and official prices, with a free JSON API.',
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
      'Every model gets three ratings. Intelligence comes from public leaderboards; cost follows from the price list, and value from intelligence and what the model costs to actually run.',
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
    showLegacy: 'Show legacy models ({n})',
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
      'Prices are in USD per 1M tokens. The blended price mixes cache reads, input and output {cache}:{input}:{output}, so about {hit}% of input tokens count as cache hits.',
    priceOverride: 'Price entered by hand; the models.dev figure is not used.',
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
    effectivePrice: 'Price counted in value',
    valueFromRunCost: 'Counted at {price} per 1M tokens, from the measured run cost',
    valueFromListPrice: 'From the blended price; no run cost measured',
    runCostNote:
      'Value uses that run cost, not the price list: divided by {typical} million tokens, the typical use among the models listed here, it gives the price counted in value.',
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
      'Prices are the official ones from models.dev, in USD per 1M tokens. Blended price = ({cache} × cache read + {input} × input + {output} × output) ÷ {total}. That counts about {hit}% of input tokens as cache hits, because agents and long chats resend their context. A model without a cache-read price pays the input price for those tokens too, and cache-write surcharges are not counted. Tiers are set by the absolute blended price.',
    costIndexBody:
      'The cost index puts a price on a 0–100 log scale: ${floor} or less is 0, ${ceil} or more is 100. It is only used to compute value.',
    valueTitle: 'Value',
    valueRunCostBody:
      'A low price per token says little if a model burns a lot of tokens, so value looks at what a model costs to run. Artificial Analysis publishes what it paid to run its whole Intelligence Index on each model. Every model gets the same suite, so that cost already reflects how many tokens the model burns, reasoning included. To put it on the per-token price scale it is divided by typical token use: the median, over the models listed here, of run cost ÷ blended price. A model that burns a typical number of tokens ends up at its blended price, a frugal one below it and a wasteful one above. A model without a run cost keeps its blended price.',
    valueRunCostNow: 'Typical token use is currently {typical} million tokens.',
    valueBody:
      'Value = intelligence^{a} × max(100 − cost index of the effective price, {min})^{b}. This is a geometric mean, so neither side can be terrible: smart but very expensive, or cheap but dim, both score low.',
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
    caveatRunCost:
      "The run cost comes from Artificial Analysis's own evaluation suite, at the reasoning level of the entry mapped there. Another workload or a lower reasoning level costs differently.",
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
      'Prices are in USD per 1M tokens. cost.blended is the blended price of cache reads, input and output (weights on the Method page), and cost.index is its 0–100 cost index.',
    fieldValue:
      'value.effective_price is the price the value score is computed from, in USD per 1M tokens, and value.cost_index is its 0–100 index. value.cost_basis says where that price comes from: run_cost when Artificial Analysis measured what the model costs to run (value.run_cost, in USD), list_price otherwise.',
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
