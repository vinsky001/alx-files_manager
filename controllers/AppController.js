import redisClient from '../utils/redis.js';
import dbClient from  '..utils/db.js';

export const getStatus = (req, res) => res.status(200).json({
  redis: redisClient.isAlive(), db: dbClient.isAlive(),
});

export const getStats = async (req, res) => res.status(200).json({
  users: await dbClient.nbUsers(),
  files: await dbClient.nbFiles(),
});
