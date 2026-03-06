import { router } from '../trpc';
import { exampleRouter } from './example';
import { newsRouter } from './news';
import { storageRouter } from './storage';
import { schedulerRouter } from './scheduler';
import { debugRouter } from './debug';

export const appRouter = router({
  example: exampleRouter,
  news: newsRouter,
  storage: storageRouter,
  scheduler: schedulerRouter,
  debug: debugRouter,
});

export type AppRouter = typeof appRouter;