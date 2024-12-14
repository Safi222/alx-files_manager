import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();

    this.client.on('error', (err) => console.log(`Redis client not connected to the server: ${err}`));
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const getKey = promisify(this.client.get).bind(this.client);
    const result = await getKey(key);
    return result;
  }

  async set(key, val, duration) {
    const setKey = promisify(this.client.setex).bind(this.client);
    await setKey(key, duration, val);
  }

  async del(key) {
    const delKey = promisify(this.client.del).bind(this.client);
    await delKey(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
