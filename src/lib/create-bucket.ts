import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

// Script to create the S3 bucket if it doesn't exist
export async function createBucketIfNotExists() {
  const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });

  const bucketName = process.env.S3_BUCKET_NAME || 'news-ranking-bucket';
  
  try {
    console.log(`🔍 Checking if bucket '${bucketName}' exists...`);
    
    // Try to access the bucket
    const headCommand = new HeadBucketCommand({ Bucket: bucketName });
    await s3Client.send(headCommand);
    
    console.log(`✅ Bucket '${bucketName}' already exists!`);
    return { exists: true, created: false };
    
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`📦 Bucket '${bucketName}' doesn't exist. Creating it...`);
      
      try {
        // Create the bucket
        const createCommand = new CreateBucketCommand({ Bucket: bucketName });
        await s3Client.send(createCommand);
        
        console.log(`✅ Bucket '${bucketName}' created successfully!`);
        return { exists: false, created: true };
        
      } catch (createError) {
        console.error(`❌ Failed to create bucket '${bucketName}':`, createError);
        throw createError;
      }
    } else {
      console.error(`❌ Failed to check bucket '${bucketName}':`, error);
      throw error;
    }
  }
}

// Test script
if (require.main === module) {
  createBucketIfNotExists()
    .then(result => {
      console.log('Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}