/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
/* eslint-disable import/extensions */
import mongodb from 'mongodb';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import {
  mkdir, writeFile, stat, existsSync, realpath,
} from 'fs';
import { join as joinPath } from 'path';
import Queue from 'bull';
// import { Request, Response } from 'express';
import { contentType } from 'mime-types';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

const users = dbClient.client.db().collection('users');
const files = dbClient.client.db().collection('files');
const ROOT_FOLDER_ID = 0;
const VALID_FILE_TYPES = {
  folder: 'folder',
  file: 'file',
  image: 'image',
};
const DEFAULT_ROOT_FOLDER = process.env.FOLDER_PATH || '/temp/files_manager';
const mkDirAsync = promisify(mkdir);
const writeFileAsync = promisify(writeFile);
const statAsync = promisify(stat);
const realpathAsync = promisify(realpath);
// const MAX_FILES_PER_PAGE = 20;
const fileQueue = new Queue('thumbnail generation');
// const NULL_ID = Buffer.alloc(24, '0').toString('utf-8');

export const postUpload = async (req, res) => {
  const token = req.headers['x-token'];
  const name = req.body ? req.body.name : null;
  const type = req.body ? req.body.type : null;
  const parentId = req.body && req.body.parentId ? req.body.parentId : ROOT_FOLDER_ID;
  const isPublic = req.body && req.body.isPublic ? req.body.isPublic : false;
  const data = req.body && req.body.data ? req.body.data : '';

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (!type) return res.status(400).json({ error: 'Missing type' });
  if (!data && type !== VALID_FILE_TYPES.folder) return res.status(400).json({ error: 'Missing data' });
  // get userId stored in Redis
  const userId = await redisClient.get(`auth_${token}`);
  // get user with token from database
  const user = await users.findOne({ _id: new mongodb.ObjectID(userId) });
  if (!user) return res.status(401).json({ error: 'Unauthorised' });
  if (parentId) {
    const parentFile = files.findOne({ _id: new mongodb.ObjectID(parentId) });
    if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
    if (parentFile && parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
  }
  const baseDir = `${process.env.FOLDER_PATH || ''}`.trim().length > 0
    ? process.env.FOLDER_PATH.trim()
    : joinPath(tmpdir(), DEFAULT_ROOT_FOLDER);
  // default baseDir == '/tmp/files_manager'
  // or (on Windows) '%USERPROFILE%/AppData/Local/Temp/files_manager';
  const newFile = {
    userId: new mongodb.ObjectID(userId),
    name,
    type,
    isPublic,
    parentId: (parentId === ROOT_FOLDER_ID) || (parentId === ROOT_FOLDER_ID.toString())
      ? '0'
      : new mongodb.ObjectID(parentId),
  };
  await mkDirAsync(baseDir, { recursive: true });
  if (type !== VALID_FILE_TYPES.folder) {
    const localPath = joinPath(baseDir, uuidv4());
    await writeFileAsync(localPath, Buffer.from(data, 'base64'));
    newFile.localPath = localPath;
  }
  const insertionInfo = await files.insertOne(newFile);
  const fileId = insertionInfo.insertedId.toString();
  // start thumbnail generation worker
  if (type === VALID_FILE_TYPES.image) {
    const jobName = `Image thumbnail [${userId}-${fileId}]`;
    fileQueue.add({ userId, fileId, name: jobName });
  }
  res.status(201).json({
    id: fileId,
    userId,
    name,
    type,
    isPublic,
    parentId: (parentId === ROOT_FOLDER_ID) || (parentId === ROOT_FOLDER_ID.toString())
      ? 0
      : parentId,
  });
};

export const getShow = async (req, res) => {
  const { id } = req.params;
  const token = req.headers['x-token'];
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const file = await files.findOne({
    _id: new mongodb.ObjectID(id),
    userId: new mongodb.ObjectID(userId),
  });
  if (!file) return res.status(404).json({ error: 'Not found' });
  return res.status(200).json({
    id: file._id.toString(),
    userId: file.userId.toString(),
    name: file.name,
    type: file.type,
    isPublic: file.isPublic,
    parentId: file.parentId,
  });
};

export const getIndex = async (req, res) => {
  const token = req.headers['x-token'];
  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const parentId = req.query.parentId || ROOT_FOLDER_ID.toString();
  const page = /\d+/.test((req.query.page || '').toString())
    ? Number.parseInt(req.query.page, 10)
    : 0;
  const filesFilter = {
    userId: new mongodb.ObjectID(userId),
    parentId: parentId === ROOT_FOLDER_ID.toString()
      ? parentId
      : new mongodb.ObjectID(parentId),
  };

  const retrievedFiles = await files
    .aggregate([
      { $match: filesFilter },
      { $sort: { _id: -1 } },
      { $skip: page * 20 },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          id: '$_id',
          userId: '$userId',
          name: '$name',
          type: '$type',
          isPublic: '$isPublic',
          parentId: {
            $cond: { if: { $eq: ['$parentId', '0'] }, then: 0, else: '$parentId' },
          },
        },
      },
    ]).toArray();
  res.status(200).json(retrievedFiles);
};

export const putPublish = async (req, res) => {
  const { id } = req.params;
  const userId = await redisClient.get(`auth_${req.headers['x-token']}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const fileFilter = {
    _id: new mongodb.ObjectID(id),
    userId: new mongodb.ObjectID(userId),
  };
  const file = await files.findOne(fileFilter);

  if (!file) return res.status(404).json({ error: 'Not found' });
  await files.updateOne(fileFilter, { $set: { isPublic: true } });
  res.status(200).json({
    id,
    userId,
    name: file.name,
    type: file.type,
    isPublic: true,
    parentId: file.parentId === ROOT_FOLDER_ID.toString()
      ? 0
      : file.parentId.toString(),
  });
};

export const putUnpublish = async (req, res) => {
  const { id } = req.params;
  const userId = await redisClient.get(`auth_${req.headers['x-token']}`);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const fileFilter = {
    _id: new mongodb.ObjectID(id),
    userId: new mongodb.ObjectID(userId),
  };
  const file = await files.findOne(fileFilter);

  if (!file) return res.status(404).json({ error: 'Not found' });
  await files.updateOne(fileFilter, { $set: { isPublic: false } });
  res.status(200).json({
    id,
    userId,
    name: file.name,
    type: file.type,
    isPublic: false,
    parentId: file.parentId === ROOT_FOLDER_ID.toString()
      ? 0
      : file.parentId.toString(),
  });
};

export const getFile = async (req, res) => {
  const { id } = req.params;
  const size = req.query.size || null;
  const userId = await redisClient.get(`auth_${req.headers['x-token']}`);
  const fileFilter = {
    _id: new mongodb.ObjectId(id),
  };
  const file = await files.findOne(fileFilter);

  if (!file || (!file.isPublic && (file.userId.toString() !== userId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (file.type === VALID_FILE_TYPES.folder) {
    return res.status(400).json({ error: 'A folder doesn\'t have content' });
  }
  let filePath = file.localPath;
  if (size) {
    filePath = `${file.localPath}_${size}`;
  }
  if (existsSync(filePath)) {
    const fileInfo = await statAsync(filePath);
    if (!fileInfo.isFile()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
  } else {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const absoluteFilePath = await realpathAsync(filePath);
  res.setHeader('Content-Type', contentType(file.name) || 'text/plain; charset=utf-8');
  res.status(200).sendFile(absoluteFilePath);
};
