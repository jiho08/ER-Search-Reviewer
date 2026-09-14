export function GET() {
  return Response.json(
    {
      gameApiConfigured: Boolean(process.env.ER_API_KEY?.trim()),
      aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
