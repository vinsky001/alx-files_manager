// eslint-disable-next-line import/extensions
import redisClient from '../utils/redis';
// eslint-disable-next-line import/no-unresolved
import dbClient from '../utils/db';

export const getStatus = (req, res) => res.status(200).json({
  redis: redisClient.isAlive(), db: dbClient.isAlive(),
});

export const getStats = async (req, res) => res.status(200).json({
  users: await dbClient.nbUsers(),
  files: await dbClient.nbFiles(),
});
