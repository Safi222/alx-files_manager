import { v4 as uuidv4 } from 'uuid';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const Queue = require('bull');

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

class FilesController {
  static async postUpload(request, response) {
    const token = request.header('X-Token');
    const { name, type } = request.body;
    const parentId = request.body.parentId || 0;
    const isPublic = request.body.isPublic || false;
    const saveDir = process.env.FOLDER_PATH || '/tmp/files_manager';
    let userId = await redisClient.get(`auth_${token}`);
    let { data } = request.body;
    if (data) {
      data = Buffer.from(data, 'base64');
    }
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    userId = new ObjectID(userId);

    if (!name) {
      response.status(400).json({ error: 'Missing name' });
      return;
    }
    const types = ['folder', 'file', 'image'];
    if (!type || !(types.includes(type))) {
      response.status(400).json({ error: 'Missing type' });
      return;
    }
    if (type !== 'folder' && !data) {
      response.status(400).json({ error: 'Missing data' });
      return;
    }
    const files = dbClient.db.collection('files');
    if (parentId) {
      const _id = new ObjectID(parentId);
      const file = await files.findOne({ _id, userId });
      if (!file) {
        response.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (file.type !== 'folder') {
        response.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    if (type === 'folder') {
      files.insertOne({
        userId, name, type, isPublic, parentId,
      }).then((addedFile) => {
        response.status(201).json(
          {
            id: addedFile.insertedId,
            userId,
            name,
            type,
            isPublic,
            parentId,
          },
        );
      }).catch((err) => {
        console.log(err);
      });
    } else {
      const localPath = path.join(saveDir, uuidv4());
      await fs.mkdir(saveDir, { recursive: true });
      await fs.writeFile(localPath, data, 'utf-8');
      files.insertOne({
        userId, name, type, isPublic, parentId, localPath,
      }).then((addedFile) => {
        response.status(201).json(
          {
            id: addedFile.insertedId,
            userId,
            name,
            type,
            isPublic,
            parentId,
          },
        );
        if (type === 'image') {
          fileQueue.add({
            userId,
            fileId: addedFile.insertedId,
          });
        }
      }).catch((err) => {
        console.log(err);
      });
    }
  }

  static async getShow(request, response) {
    const token = request.header('X-Token');
    const { id } = request.params;
    let userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    userId = new ObjectID(userId);

    const files = dbClient.db.collection('files');
    const _id = new ObjectID(id);
    const file = await files.findOne({ _id, userId });
    if (!file) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    response.status(200).json(
      {
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      },
    );
  }

  static async getIndex(request, response) {
    const token = request.header('X-Token');
    const page = parseInt(request.query.page, 10);
    let parentId = request.query.parentId || 0;
    let userId = await redisClient.get(`auth_${token}`);
    let query;

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    userId = new ObjectID(userId);
    if (parentId) {
      parentId = new ObjectID(parentId);
      query = { parentId, userId };
    } else {
      query = { userId };
    }

    const files = dbClient.db.collection('files');
    files.aggregate(
      [
        { $match: query },
        {
          $set: {
            id: '$_id',
          },
        },
        {
          $unset: [
            'localPath',
            '_id',
          ],
        },
        {
          $skip: page * 20,
        },
        {
          $limit: 20,
        },
      ],
    ).toArray((err, result) => {
      if (result) {
        response.status(200).json(result);
      } else {
        response.status(404).json({ error: 'Not found' });
      }
    });
  }

  static async putPublish(request, response) {
    const token = request.header('X-Token');
    const { id } = request.params;
    let userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    userId = new ObjectID(userId);

    const files = dbClient.db.collection('files');
    const _id = new ObjectID(id);
    const result = await files.findOneAndUpdate(
      {
        _id, userId,
      },
      {
        $set: { isPublic: true },
      },
      {
        returnOriginal: false,
      },
    );

    const file = result.value;
    if (!file) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    response.status(200).json(
      {
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      },
    );
  }

  static async putUnpublish(request, response) {
    const token = request.header('X-Token');
    const { id } = request.params;
    let userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    userId = new ObjectID(userId);

    const files = dbClient.db.collection('files');
    const _id = new ObjectID(id);
    const result = await files.findOneAndUpdate(
      {
        _id, userId,
      },
      {
        $set: { isPublic: false },
      },
      {
        returnOriginal: false,
      },
    );
    const file = result.value;
    if (!file) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    response.status(200).json(
      {
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      },
    );
  }

  static async getFile(request, response) {
    const token = request.header('X-Token');
    const size = request.param('size');
    const { id } = request.params;
    let userId = await redisClient.get(`auth_${token}`);

    if (userId) {
      userId = new ObjectID(userId);
    }

    const files = dbClient.db.collection('files');
    const _id = new ObjectID(id);
    const file = await files.findOne({ _id });

    if (!file) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    if (!file.isPublic && (`${file.userId}` !== `${userId}`)) {
      response.status(404).json({ error: 'Not found' });
      return;
    }
    if (file.type === 'folder') {
      response.status(400).json({ error: "A folder doesn't have content" });
      return;
    }
    try {
      let filePath = file.localPath;
      if (size) {
        filePath = `${filePath}_${size}`;
      }
      const data = await fs.readFile(filePath);
      const contentType = mime.contentType(file.name);
      if (contentType) {
        response.set('Content-Type', contentType);
      }
      response.status(200).send(data);
    } catch (err) {
      response.status(404).json({ error: 'Not found' });
    }
  }
}
module.exports = FilesController;
