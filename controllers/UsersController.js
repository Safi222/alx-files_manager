import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = require('mongodb');
const Queue = require('bull');

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

const sha1 = require('sha1');

class UsersController {
  static postNew(request, response) {
    const { email, password } = request.body;
    if (!email) {
      response.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      response.status(400).json({ error: 'Missing password' });
      return;
    }
    const users = dbClient.db.collection('users');
    users.findOne({ email }, (err, user) => {
      if (user) {
        response.status(400).json({ error: 'Already exist' });
      } else {
        const hashedPass = sha1(password);
        users.insertOne({ email, password: hashedPass }).then((result) => {
          response.status(201).json({ id: result.insertedId, email });
          userQueue.add({
            userId: result.insertedId,
          });
        }).catch((err) => {
          console.log(err);
        });
      }
    });
  }

  static async getMe(request, response) {
    const token = request.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    } else {
      const users = dbClient.db.collection('users');
      const objectId = new ObjectId(userId);
      users.findOne({ _id: objectId }, (err, user) => {
        if (user) {
          response.status(200).json({ id: userId, email: user.email });
        } else {
          response.status(401).json({ error: 'Unauthorized' });
        }
      });
    }
  }
}
module.exports = UsersController;
