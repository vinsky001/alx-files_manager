import crypto from 'crypto';
// eslint-disable-next-line linebreak-style
import { v4 as uuidv4 } from 'uuid';
// eslint-disable-next-line linebreak-style
import dbClient from '../utils/db';
// eslint-disable-next-line linebreak-style
import redisClient from '../utils/redis';

export const getConnect = async (req, res) => {
  // get base64 authorization header
  const authHeader = req.headers.authorization;

  const base64Str = authHeader.split(' ')[1];
  // decode base64 string
  const buff = Buffer.from(base64Str, 'base64');
  // get user credentials from decoded base64
  const credentials = buff.toString('utf-8');
  const credentialsRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+:[\S]+$/;

  if (credentialsRegex.test(credentials)) {
    const email = credentials.split(':')[0];
    const password = crypto.createHash('sha1').update(credentials.split(':')[1]).digest('hex');
    // get user from database with email and check if passwords are similar
    const user = await dbClient.client.db().collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.password !== password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = uuidv4();
    const time = 60 * 60 * 24;
    if (redisClient.isAlive()) await redisClient.set(`auth_${token}`, user._id.toString(), time);
    return res.status(200).json({ token });
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

export const getDisconnect = async (req, res) => {
  const token = req.headers['x-token'];
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  await redisClient.del(`auth_${token}`);
  return res.sendStatus(204);
};
