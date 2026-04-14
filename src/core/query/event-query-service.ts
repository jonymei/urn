import type { QueryFilter } from "../types/query.js";
import type { EventRecord } from "../types/event.js";
import { EventRepo, type EventStats } from "../storage/event-repo.js";

export class EventQueryService {
  constructor(private readonly eventRepo: EventRepo) {}

  query(filter: QueryFilter): EventRecord[] {
    return this.eventRepo.query(filter);
  }

  stats(filter: QueryFilter): EventStats {
    return this.eventRepo.stats(filter);
  }
}
