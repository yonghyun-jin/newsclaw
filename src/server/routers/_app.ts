import { router } from '../trpc';
import { exampleRouter } from './example';
import { newsRouter } from './news';
import { storageRouter } from './storage';
import { schedulerRouter } from './scheduler';

export const appRouter = router({
  example: exampleRouter,
  news: newsRouter,
  storage: storageRouter,
  scheduler: schedulerRouter,
});

export type AppRouter = typeof appRouter;