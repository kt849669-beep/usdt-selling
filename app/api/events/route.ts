export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let controller: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ping\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 5000); // Send heartbeat
    },
    cancel() {
      // Clean up
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
