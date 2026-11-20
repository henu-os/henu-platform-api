import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { CatalogueManagementService } from '../src/modules/admin/catalogue/catalogue.service';
import { RealtimeEventsService } from '../src/common/realtime/realtime-events.service';
import { CatalogueSignerService } from '../src/common/crypto/catalogue-signer.service';
import { HubService } from '../src/modules/hub/hub.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeContentHash } from '../src/common/crypto/canonical-json';

describe('HENU Real-time Synchronization Lifecycle (End-to-End)', () => {
  let moduleRef: TestingModule;
  let catalogueService: CatalogueManagementService;
  let realtimeEventsService: RealtimeEventsService;
  let signerService: CatalogueSignerService;
  let hubService: HubService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    catalogueService = moduleRef.get(CatalogueManagementService);
    realtimeEventsService = moduleRef.get(RealtimeEventsService);
    signerService = moduleRef.get(CatalogueSignerService);
    hubService = moduleRef.get(HubService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('1. Admin publishes a new revision: produces canonical contentHash, valid Ed25519 signature and emits SSE event', async () => {
    const summary = 'E2E Test: Authoritative Production Revision';
    const published = await catalogueService.publishRevision(summary);

    expect(published.revisionNumber).toBeGreaterThan(0);
    expect(published.contentHash).toBeDefined();
    expect(published.signature).toBeDefined();
    expect(published.signature.algorithm).toBe('ed25519');
    expect(published.signature.keyId).toBe('henu-root-2026-v1');

    // Verify cryptographic signature directly with public key
    const isValidSig = signerService.verify(
      published.contentHash,
      published.signature.value,
      signerService.getActivePublicKeyHex(),
    );
    expect(isValidSig).toBe(true);

    // Verify latest catalogue served to Hub matches
    const { manifest, contentHash } = await hubService.getLatestCatalogue();
    expect(manifest.revision).toBe(published.revisionNumber);
    expect(contentHash).toBe(published.contentHash);
    expect((manifest as any).signature.value).toBe(published.signature.value);

    // Verify canonical contentHash computation over manifest applications
    const computedHash = computeContentHash(manifest.applications || []);
    expect(computedHash).toBe(published.contentHash);
  });

  it('2. Durable SSE event logging: hub_events records catalogue.updated and allows missed event replay', async () => {
    const testRevision = 99999;
    const testHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const eventId = await realtimeEventsService.emitCatalogueUpdated({
      revision: testRevision,
      contentHash: testHash,
      catalogueUrl: 'http://localhost:3000/api/v1/hub/catalogue',
      publishedAt: new Date().toISOString(),
      summary: 'Replay Test Event',
      totalApplications: 4,
    });

    expect(eventId).toBeDefined();
    const eventBigInt = BigInt(eventId);

    // Query missed events using Last-Event-ID = eventBigInt - 1
    const missed = await realtimeEventsService.getMissedEvents(String(eventBigInt - 1n));
    expect(missed.length).toBeGreaterThanOrEqual(1);

    const targetEvent = missed.find((e) => String(e.id) === eventId);
    expect(targetEvent).toBeDefined();
    expect(targetEvent?.type).toBe('catalogue.updated');
    expect((targetEvent?.data as any).revision).toBe(testRevision);
  });

  it('3. Catalogue Rollback: creates an immutable forward revision N+1 with target content and fresh signature', async () => {
    const activeRevision = await prisma.catalogueRevision.findFirst({
      where: { isActive: true },
      orderBy: { revisionNumber: 'desc' },
    });
    expect(activeRevision).toBeDefined();

    // Rollback to the active revision number
    const rollback = await catalogueService.rollbackCatalogue(activeRevision!.revisionNumber);

    // Must be a forward revision preserving immutability
    expect(rollback.revision).toBe(activeRevision!.revisionNumber + 1);

    // Verify forward revision signature
    const isValidRollbackSig = signerService.verify(
      rollback.contentHash,
      rollback.signature.value,
      signerService.getActivePublicKeyHex(),
    );
    expect(isValidRollbackSig).toBe(true);

    // Verify latest catalogue is now the rollback revision
    const { manifest } = await hubService.getLatestCatalogue();
    expect(manifest.revision).toBe(rollback.revision);
  });
});
