import { Injectable, Logger, Optional } from '@nestjs/common';
import { Observable, Subject, from, interval, merge } from 'rxjs';
import { map, concatMap } from 'rxjs/operators';
import { PrismaService } from '@/prisma/prisma.service';

export interface SseMessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

export interface CatalogueUpdatedEventPayload {
  revision: number;
  contentHash: string;
  catalogueUrl: string;
  publishedAt: string;
  summary: string;
  totalApplications: number;
  signature?: {
    algorithm: string;
    keyId: string;
    value: string;
  };
}

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private readonly liveEventSubject = new Subject<SseMessageEvent>();
  private activeConnections = 0;
  private readonly MAX_CONNECTIONS = 1000;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Broadcast an event to all connected desktop Hubs and Admin panels.
   * Persists the event in PostgreSQL (hub_events) for durable replay.
   */
  async broadcast(eventType: string, data: any): Promise<string> {
    let numericId = String(Date.now());

    if (this.prisma) {
      try {
        const saved = await this.prisma.hubEvent.create({
          data: {
            eventType,
            payload: data as unknown as object,
          },
        });
        numericId = saved.id.toString();
      } catch (err: any) {
        this.logger.warn(`Failed to persist HubEvent in PostgreSQL: ${err.message}. Emitting in-memory.`);
      }
    }

    this.logger.log(`Broadcasting SSE event: [${eventType}] id: #${numericId}`);

    const sseEvent: SseMessageEvent = {
      type: eventType,
      data,
      id: numericId,
      retry: 5000,
    };

    this.liveEventSubject.next(sseEvent);

    // Also emit normalized alias if needed (e.g. catalogue:updated vs catalogue.updated)
    if (eventType === 'catalogue.updated') {
      this.liveEventSubject.next({
        type: 'catalogue:updated',
        data,
        id: numericId,
        retry: 5000,
      });
    }

    return numericId;
  }

  /**
   * Helper to broadcast a standard catalogue.updated notification
   */
  async emitCatalogueUpdated(payload: CatalogueUpdatedEventPayload): Promise<string> {
    return this.broadcast('catalogue.updated', payload);
  }

  /**
   * Query historical missed events for client reconnection
   */
  async getMissedEvents(lastEventIdStr: string): Promise<SseMessageEvent[]> {
    if (!this.prisma) return [];

    try {
      const lastId = BigInt(lastEventIdStr);
      const events = await this.prisma.hubEvent.findMany({
        where: {
          id: { gt: lastId },
        },
        orderBy: { id: 'asc' },
        take: 100,
      });

      return events.map((e) => ({
        type: e.eventType,
        data: e.payload as any,
        id: e.id.toString(),
        retry: 5000,
      }));
    } catch {
      // If parsing BigInt fails, fallback to empty
      return [];
    }
  }

  /**
   * Stream events to a connected client with replay of missed events and keepalive
   */
  getEventStream(lastEventId?: string): Observable<SseMessageEvent> {
    if (this.activeConnections >= this.MAX_CONNECTIONS) {
      this.logger.warn(`Max SSE connections reached (${this.MAX_CONNECTIONS}). Rejecting new stream.`);
      throw new Error('Connection limit exceeded. Please retry later.');
    }

    this.activeConnections++;
    this.logger.log(`Client connected to Hub SSE stream. Active connections: ${this.activeConnections}`);

    const heartbeat$ = interval(20000).pipe(
      map((seq) => ({
        type: 'ping',
        data: {
          event: 'heartbeat',
          timestamp: new Date().toISOString(),
          seq,
        },
      })),
    );

    // Handle missed events replay
    let stream$: Observable<SseMessageEvent>;

    if (lastEventId) {
      const missed$ = from(this.getMissedEvents(lastEventId)).pipe(
        concatMap((events) => from(events)),
      );
      stream$ = merge(missed$, this.liveEventSubject.asObservable(), heartbeat$);
    } else {
      stream$ = merge(this.liveEventSubject.asObservable(), heartbeat$);
    }

    return new Observable<SseMessageEvent>((observer) => {
      const sub = stream$.subscribe(observer);
      return () => {
        sub.unsubscribe();
        this.activeConnections = Math.max(0, this.activeConnections - 1);
        this.logger.log(`Client disconnected from Hub SSE stream. Active connections: ${this.activeConnections}`);
      };
    });
  }

  getActiveConnectionCount(): number {
    return this.activeConnections;
  }
}
