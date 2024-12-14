import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(request, response) {
    const appStatus = { redis: redisClient.isAlive(), db: dbClient.isAlive() };
    response.status(200).json(appStatus);
  }

  static async getStats(request, response) {
    const nbUsers = await dbClient.nbUsers();
    const nbFiles = await dbClient.nbFiles();
    const appStats = { users: nbUsers, files: nbFiles };
    response.status(200).json(appStats);
  }
}
module.exports = AppController;
