import type { GiscusConfig } from './giscus';

/**
 * Where the discussion thread on each model page lives: a GitHub Discussions
 * category, embedded with giscus (https://giscus.app). See docs/SPEC.md,
 * "Model page".
 *
 * The category uses the Announcement format, so only maintainers and the
 * giscus app can open threads. The IDs come from giscus.app, or from the
 * GitHub GraphQL API: `repository { id discussionCategories { nodes { id name } } }`.
 *
 * Leave any field empty and model pages render no discussion section.
 */
export const giscusConfig: GiscusConfig = {
  repo: 'scarletkc/mekiki',
  repoId: 'R_kgDOVplH6A',
  category: 'Models',
  categoryId: 'DIC_kwDOVplH6M4DK4q_',
};
