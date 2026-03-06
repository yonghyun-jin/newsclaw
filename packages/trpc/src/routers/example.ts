import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const exampleRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input?.name ?? 'World'}!`,
      };
    }),

  getAll: publicProcedure.query(() => {
    return [
      { id: 1, text: 'First item' },
      { id: 2, text: 'Second item' },
    ];
  }),
});