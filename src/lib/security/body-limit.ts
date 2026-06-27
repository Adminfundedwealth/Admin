import { NextRequest, NextResponse } from 'next/server';

/**
 * Request body size limit enforcement.
 * Prevents denial-of-service via oversized payloads.
 */

const DEFAULT_LIMIT = 1024 * 1024; // 1MB default
const MAX_JSON_LIMIT = 2 * 1024 * 1024; // 2MB max for JSON

/**
 * Parse JSON body with size limit enforcement.
 * Returns the parsed body or an error response.
 */
export async function parseBodyWithLimit<T = unknown>(
  request: NextRequest,
  maxBytes: number = DEFAULT_LIMIT
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const contentLength = request.headers.get('content-length');
    
    // Quick reject based on Content-Length header
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return {
        data: null,
        error: NextResponse.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: `Request body exceeds ${Math.round(maxBytes / 1024)}KB limit` } },
          { status: 413 }
        ),
      };
    }

    const body = await request.json();
    
    // Secondary check: validate serialized size
    const serialized = JSON.stringify(body);
    if (serialized.length > maxBytes) {
      return {
        data: null,
        error: NextResponse.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: `Request body exceeds ${Math.round(maxBytes / 1024)}KB limit` } },
          { status: 413 }
        ),
      };
    }

    return { data: body as T, error: null };
  } catch {
    return {
      data: null,
      error: NextResponse.json(
        { error: { code: 'INVALID_BODY', message: 'Invalid JSON in request body' } },
        { status: 400 }
      ),
    };
  }
}
