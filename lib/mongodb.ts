import mongoose from 'mongoose';

const MONGODB_URI = process.env.DATABASE_URL ?? '';

interface MongooseConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseConnection: MongooseConnection | undefined;
}

let cached: MongooseConnection = global.mongooseConnection || { conn: null, promise: null };

if (!global.mongooseConnection) {
  global.mongooseConnection = cached;
}

export function isValidMongoUri(uri: string): boolean {
  if (!uri) return false;
  // Check if it's a placeholder URI
  if (uri.includes('usuario:senha@host:porta')) return false;
  // Check basic mongodb URI format
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (!isValidMongoUri(MONGODB_URI)) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  if (cached?.conn) {
    return cached.conn;
  }

  if (!cached?.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;
