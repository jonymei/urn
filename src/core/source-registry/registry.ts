import type { SourceFetcher } from "../types/fetch.js";

export class SourceRegistry {
  constructor(private readonly fetchers: SourceFetcher[]) {}

  list(): SourceFetcher[] {
    return [...this.fetchers];
  }

  getById(id: string): SourceFetcher | undefined {
    return this.fetchers.find((fetcher) => fetcher.definition.id === id);
  }

  resolveMany(id: string): SourceFetcher[] {
    if (id === "all") {
      return this.list();
    }
    const fetcher = this.getById(id);
    if (!fetcher) {
      throw new Error(`Unknown source: ${id}`);
    }
    return [fetcher];
  }
}
