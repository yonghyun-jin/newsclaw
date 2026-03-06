import { router } from '../trpc';
import { exampleRouter } from './example';
import { newsRouter } from './news';
import { storageRouter } from './storage';

export const appRouter = router({
  example: exampleRouter,
  news: newsRouter,
  storage: storageRouter,
});

export type AppRouter = typeof appRouter;