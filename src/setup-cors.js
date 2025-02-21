import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucketName = 'augurrank-001.appspot.com';

// cloud.google.com/storage/docs/cross-origin
const getBucketMetadata = async () => {
  const [metadata] = await storage.bucket(bucketName).getMetadata();
  console.log(JSON.stringify(metadata, null, 2));
};

const configureBucketCors = async () => {
  const origin = ['*'];
  const method = ['GET', 'HEAD'];
  const responseHeader = ['Content-Type', 'ETag'];
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  await storage.bucket(bucketName).setCorsConfiguration([
    { origin, method, responseHeader, maxAgeSeconds },
  ]);

  console.log(`Bucket ${bucketName} was updated with a CORS config to allow ${method} requests from ${origin}`);
};

getBucketMetadata();
//configureBucketCors().catch(console.error);
