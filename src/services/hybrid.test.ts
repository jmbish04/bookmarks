import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { HybridService } from './hybrid';

/**
 * Mock environment factory
 */
function createMockEnv(): Env {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
      exec: vi.fn().mockResolvedValue({ success: true }),
      batch: vi.fn().mockResolvedValue([]),
      dump: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    } as any,
    BOOKMARK_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as any,
    // Other bindings as needed
    AI: {} as any,
    VECTORIZE: {} as any,
    HTML_CACHE: {} as any,
    PODCAST_BUCKET: {} as any,
    ASSETS: {} as any,
    RAINDROP_TOKEN: 'test-token',
    RAINDROP_COLLECTION_ID: '0',
    RAINDROP_CLIENT_ID: 'test-client-id',
    RAINDROP_CLIENT_SECRET: 'test-client-secret',
    APP_URL: 'http://localhost:8787' as any,
    PODCAST_BASE_URL: 'http://localhost:8787/podcast' as any,
    OPENAI_API_KEY: 'test-openai-key',
    CLOUDFLARE_IMAGES_TOKEN: 'test-images-token',
    CLOUDFLARE_IMAGES_ACCOUNT_ID: 'test-account-id',
    BROWSER: {} as any,
  };
}

/**
 * Mock the drizzle database client
 */
vi.mock('../db/client', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/client';

/**
 * Helper to create a properly chained mock DB
 */
function createChainedMockDb(options: {
  existingUrls?: string[];
  existingBookmarks?: any[];
  totalCount?: number;
  insertShouldFail?: boolean;
} = {}) {
  const {
    existingUrls = [],
    existingBookmarks = [],
    totalCount = existingBookmarks.length,
    insertShouldFail = false
  } = options;

  // Track calls for assertions
  const calls = {
    select: [] as any[],
    insert: [] as any[],
    where: [] as any[],
  };

  const mockDb: any = {
    calls,
    select: vi.fn().mockImplementation((selectArg) => {
      calls.select.push(selectArg);
      return {
        from: vi.fn().mockImplementation((table) => {
          // Different behavior based on what's being selected
          const selectForCount = selectArg && 'count' in (selectArg || {});
          
          return {
            get: vi.fn().mockResolvedValue(selectForCount ? { count: totalCount } : null),
            where: vi.fn().mockImplementation((condition) => {
              calls.where.push(condition);
              // Return existing URLs for the duplicate check
              return Promise.resolve(existingUrls.map(url => ({ url })));
            }),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(existingBookmarks),
              }),
            }),
          };
        }),
      };
    }),
    insert: vi.fn().mockImplementation((table) => {
      return {
        values: vi.fn().mockImplementation((values) => {
          calls.insert.push(values);
          if (insertShouldFail) {
            return Promise.reject(new Error('Database insert failed'));
          }
          return Promise.resolve({ success: true });
        }),
      };
    }),
  };

  return mockDb;
}

describe('HybridService', () => {
  let mockEnv: Env;
  let service: HybridService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('addBookmarks - URL Deduplication (Critical for Billing)', () => {
    it('should deduplicate input URLs within the same batch', async () => {
      // Arrange: URLs with duplicates
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page1',
        'https://example.com/page1', // duplicate
        'https://example.com/page2',
        'https://example.com/page1', // another duplicate
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Only 2 unique URLs should be processed
      expect(result.processed).toBe(2);
      expect(result.items).toHaveLength(2);
      
      // Verify queue was called only twice
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(2);
    });
    
    it('should NOT process URLs that already exist in the database', async () => {
      // Arrange: One URL already exists in database
      const existingUrl = 'https://example.com/existing';
      const newUrl = 'https://example.com/new';
      
      const mockDb = createChainedMockDb({ existingUrls: [existingUrl] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.addBookmarks([existingUrl, newUrl]);
      
      // Assert: Only new URL should be processed
      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(1);
      
      // Verify the queued URL is the new one
      const sentMessage = (mockEnv.BOOKMARK_QUEUE.send as Mock).mock.calls[0][0];
      expect(sentMessage.link).toBe(newUrl);
    });
    
    it('should normalize URLs with trailing slashes for deduplication', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page',
        'https://example.com/page/', // same URL with trailing slash
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Should deduplicate and only process once
      expect(result.processed).toBe(1);
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(1);
    });
    
    it('should normalize URLs with different cases for deduplication', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page',
        'HTTPS://EXAMPLE.COM/PAGE', // same URL with different case
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Should deduplicate and only process once
      expect(result.processed).toBe(1);
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(1);
    });
    
    it('should send correct queue message format', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const url = 'https://example.com/test';
      
      // Act
      await service.addBookmarks([url]);
      
      // Assert: Queue message format
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(1);
      const sentMessage = (mockEnv.BOOKMARK_QUEUE.send as Mock).mock.calls[0][0];
      
      expect(sentMessage).toHaveProperty('raindropId');
      expect(typeof sentMessage.raindropId).toBe('number');
      expect(sentMessage).toHaveProperty('link', url);
      expect(sentMessage).toHaveProperty('title', url);
      expect(sentMessage).toHaveProperty('created');
      expect(typeof sentMessage.created).toBe('string');
    });
    
    it('should handle empty URL array gracefully', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.addBookmarks([]);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.items).toHaveLength(0);
      expect(mockEnv.BOOKMARK_QUEUE.send).not.toHaveBeenCalled();
    });
    
    it('should handle database insertion errors gracefully and continue with other URLs', async () => {
      const mockDb = createChainedMockDb({ 
        existingUrls: [],
        insertShouldFail: true 
      });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.addBookmarks(['https://example.com/failing']);
      
      // Assert: Should not throw, but return with 0 processed
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
    });
    
    it('should generate unique raindrop IDs for each URL', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3',
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: All items should have unique raindrop IDs
      const ids = result.items.map(item => item._id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
    
    it('should skip ALL matching database URLs (not just first match)', async () => {
      // Arrange: Multiple URLs exist in database
      const existingUrls = [
        'https://example.com/existing1',
        'https://example.com/existing2',
      ];
      
      const mockDb = createChainedMockDb({ existingUrls });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/existing1',
        'https://example.com/existing2',
        'https://example.com/new',
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Only new URL should be processed
      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(2);
    });
    
    it('should never queue the same URL more than once in a single call (BILLING CRITICAL)', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Try to trick the system with many duplicates
      const expensiveUrl = 'https://example.com/expensive-to-process';
      const urls = Array(100).fill(expensiveUrl);
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: URL should only be queued ONCE
      expect(result.processed).toBe(1);
      expect(mockEnv.BOOKMARK_QUEUE.send).toHaveBeenCalledTimes(1);
      
      const sentMessages = (mockEnv.BOOKMARK_QUEUE.send as Mock).mock.calls;
      const queuedUrls = sentMessages.map(call => call[0].link);
      expect(queuedUrls.filter(u => u === expensiveUrl)).toHaveLength(1);
    });
  });
  
  describe('listBookmarks', () => {
    it('should return empty array when no bookmarks exist', async () => {
      const mockDb = createChainedMockDb({ totalCount: 0 });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.listBookmarks(0, 10);
      
      // Assert
      expect(result.items).toHaveLength(0);
      expect(result.count).toBe(0);
    });
    
    it('should return bookmarks in RaindropItem format', async () => {
      const mockBookmarks = [
        { 
          raindropId: 123, 
          title: 'Test Title', 
          url: 'https://example.com/test', 
          createdAt: '2024-01-01T00:00:00Z', 
          summary: 'Test summary' 
        },
      ];
      
      const mockDb = createChainedMockDb({ 
        existingBookmarks: mockBookmarks,
        totalCount: 1 
      });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.listBookmarks(0, 10);
      
      // Assert: Should have RaindropItem format
      expect(result.count).toBe(1);
      expect(result.items[0]).toEqual(expect.objectContaining({
        _id: 123,
        title: 'Test Title',
        link: 'https://example.com/test',
        created: '2024-01-01T00:00:00Z',
        excerpt: 'Test summary',
        type: 'link',
        tags: [],
        domain: 'example.com',
      }));
    });
    
    it('should handle missing title gracefully', async () => {
      const mockBookmarks = [
        { 
          raindropId: 123, 
          title: null, 
          url: 'https://example.com/test', 
          createdAt: '2024-01-01', 
          summary: null 
        },
      ];
      
      const mockDb = createChainedMockDb({ 
        existingBookmarks: mockBookmarks,
        totalCount: 1 
      });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.listBookmarks(0, 10);
      
      // Assert: Should fall back to "Untitled"
      expect(result.items[0].title).toBe('Untitled');
    });
    
    it('should extract domain correctly from URL', async () => {
      const mockBookmarks = [
        { 
          raindropId: 123, 
          title: 'Test', 
          url: 'https://sub.example.com/path?query=1', 
          createdAt: '2024-01-01', 
          summary: null 
        },
      ];
      
      const mockDb = createChainedMockDb({ 
        existingBookmarks: mockBookmarks,
        totalCount: 1 
      });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.listBookmarks(0, 10);
      
      // Assert: Domain should be extracted (hostname)
      expect(result.items[0].domain).toBe('sub.example.com');
    });
  });
  
  describe('URL Normalization (normalizeUrl)', () => {
    // Testing normalizeUrl indirectly through addBookmarks
    
    it('should handle invalid URLs gracefully', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Invalid URL should be passed through as-is
      const invalidUrl = 'not-a-valid-url';
      
      // Act
      const result = await service.addBookmarks([invalidUrl]);
      
      // Assert: Should still attempt to process (DB will fail but that's OK)
      expect(result.success).toBe(true);
    });
    
    it('should handle URLs with query parameters', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page?param=1',
        'https://example.com/page?param=2', // Different query param
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Different query params = different URLs
      expect(result.processed).toBe(2);
    });
    
    it('should handle URLs with fragments', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com/page#section1',
        'https://example.com/page#section2', // Different fragment
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Different fragments = different URLs
      expect(result.processed).toBe(2);
    });
    
    it('should normalize default ports (80 for http, 443 for https)', async () => {
      const mockDb = createChainedMockDb({ existingUrls: [] });
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      const urls = [
        'https://example.com:443/page',
        'https://example.com/page', // Same URL without port
      ];
      
      // Act
      const result = await service.addBookmarks(urls);
      
      // Assert: Default port should be normalized away
      expect(result.processed).toBe(1);
    });
  });
  
  describe('Database Error Handling', () => {
    it('should continue processing when database existence check fails', async () => {
      // Create a mock that fails on the select query
      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockRejectedValue(new Error('Database connection failed')),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      
      (getDb as Mock).mockReturnValue(mockDb);
      service = new HybridService(mockEnv);
      
      // Act
      const result = await service.addBookmarks(['https://example.com/test']);
      
      // Assert: Should still attempt to process despite DB check failure
      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
    });
  });
});
