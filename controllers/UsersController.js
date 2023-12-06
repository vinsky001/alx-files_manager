import crypto from 'crypto';
import mongodb from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

export const postNew = async (req, res) => {
  // get email and password from request body
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Missing password' });
  }

  // check if email already exists
  const user = await dbClient.client.db().collection('users').findOne({ email });

  if (user) {
    return res.status(400).json({ error: 'Already exists' });
  }

  // hash the password using SHA1 algorithm and save user to database
  const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

  const savedUser = await dbClient.client.db().collection('users').insertOne({
    email,
    password: hashedPassword,
  });

  return res.status(201).json({ id: savedUser.insertedId, email });
};

export const getMe = async (req, res) => {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await dbClient.client.db().collection('users').findOne({ _id: new mongodb.ObjectID(userId) });
  if (user) {
    return res.status(200).json({ id: userId, email: user.email });
  }
  return res.status(401).json({ error: 'Unauthorized' });
};
