# TreinoAI - Project Guidelines

## Tech Stack

- **Framework**: Fastify 5 with TypeScript (ES2024, ESM)
- **Database**: PostgreSQL + Prisma 7 with PrismaPg adapter
- **Auth**: better-auth (email/password, headers-based sessions)
- **Validation**: Zod with fastify-type-provider-zod
- **Docs**: Swagger + Scalar UI at `/docs`

## Architecture

```
Routes → UseCases → Prisma
```

- **Routes** ([src/routes/](src/routes/)): HTTP handlers with Zod schema validation, map errors to HTTP codes
- **UseCases** ([src/usecases/](src/usecases/)): Business logic classes with `execute(dto)` method, use Prisma transactions
- **Errors** ([src/errors/](src/errors/)): Custom error classes caught by routes
- **Schemas** ([src/schemas/](src/schemas/)): Zod schemas, reuse Prisma enums from `src/generated/prisma/`

## Build and Commands

```bash
npm run dev          # Start dev server (tsx --watch)
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma migrate dev --name <name>  # Create migration
```

## Code Conventions

### New Route

1. Create route file in `src/routes/` as async factory function
2. Use `ZodTypeProvider` for type-safe schemas
3. Validate both request body and response codes
4. Call use case, catch errors, map to HTTP status

```typescript
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

export async function myRoute(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post("/path", {
    schema: { body: MySchema, response: { 201: ResponseSchema } },
  }, async (request, reply) => {
    // implementation
  });
}
```

### New UseCase

1. Create class in `src/usecases/` with `execute(input: InputDTO): Promise<OutputDTO>`
2. Use `prisma.$transaction()` for nested operations
3. Throw custom errors from `src/errors/`

### Database Changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <descriptive-name>`
3. Run `npx prisma generate`
4. Generated types are in `src/generated/prisma/`

### Authentication

Check session manually in route handlers:

```typescript
const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
if (!session) return reply.status(401).send({ error: "Unauthorized" });
```

## Imports

- Use `.js` extension for local imports (ESM requirement)
- Import order is enforced by ESLint (simple-import-sort)
- Import Prisma enums from `src/generated/prisma/enums.js`
