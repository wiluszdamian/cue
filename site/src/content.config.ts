import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The site renders the repository's /docs as they are, so the markdown on
// GitHub and the pages here can never drift apart.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../docs' }),
});

export const collections = { docs };
