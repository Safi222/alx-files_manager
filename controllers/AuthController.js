import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const sha1 = require('sha1');

class AuthController {
  static getConnect(request, response) {
    const authHeader = request.header('Authorization');
    const base64 = authHeader.split('Basic ');
    const decodedStr = Buffer.from(base64[1], 'base64').toString('utf-8');
    const data = decodedStr.split(':');
    if (data.length !== 2) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const email = data[0];
    const password = sha1(data[1]);
    const users = dbClient.db.collection('users');
    users.findOne({ email, password }, async (err, user) => {
      if (!user) {
        response.status(401).json({ error: 'Unauthorized' });
      } else {
        const token = uuidv4();
        await redisClient.set(`auth_${token}`, user._id.toString(), 60 * 60 * 24);
        response.status(200).json({ token });
      }
    });
  }

  static async getDisconnect(request, response) {
    const token = request.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    } else {
      await redisClient.del(`auth_${token}`);
      response.status(204).json({});
    }
  }
}
module.exports = AuthController;
