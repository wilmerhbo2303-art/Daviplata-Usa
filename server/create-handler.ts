import express, { type Express, type IRouter } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export function createDaviApiHandler(router: IRouter, endpointPath: string): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split('?')[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.use((req, _res, next) => {
    const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `${endpointPath}${query}`;
    next();
  });
  app.use('/api', router);
  return app;
}
