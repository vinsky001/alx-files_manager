import { Router } from 'express';
import { getStats, getStatus } from '../controllers/AppController.js';
import { postNew, getMe } from '../controllers/UsersController.js';
import { getConnect, getDisconnect } from '../controllers/AuthController.js';
import {
  postUpload, getShow, getIndex, putPublish, putUnpublish, getFile,
} from '../controllers/FilesController.js';

const router = Router();

router
  .get('/status', getStatus)
  .get('/stats', getStats)
  .post('/users', postNew)
  .get('/users/me', getMe)
  .get('/connect', getConnect)
  .get('/disconnect', getDisconnect)
  .post('/files', postUpload)
  .get('/files', getIndex)
  .get('/files/:id', getShow)
  .get('/files/:id/data', getFile)
  .put('/files/:id/publish', putPublish)
  .put('/files/:id/unpublish', putUnpublish);

export default router;
