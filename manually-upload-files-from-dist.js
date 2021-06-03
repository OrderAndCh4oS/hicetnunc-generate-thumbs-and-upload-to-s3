require('dotenv').config();
const fs = require('fs');

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET

if(!AWS_ACCESS_KEY_ID) throw new Error('Missing AWS_ACCESS_KEY_ID environment variable')
if(!AWS_SECRET_ACCESS_KEY) throw new Error('Missing AWS_SECRET_ACCESS_KEY environment variable')
if(!AWS_S3_BUCKET_NAME) throw new Error('Missing AWS_S3_BUCKET environment variable')

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
});

const uploadToS3 = async (fileName) => {
    const fileContent = fs.readFileSync(`./dist/${fileName}`);
    await s3.upload({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ACL: "public-read",
        CacheControl: "public, max-age=604800, immutable",
        ContentType: "image/png",
    }).promise();
};

const isFileInS3 = async (fileName) => {
    try {
        await s3.headObject({
            Bucket: AWS_S3_BUCKET_NAME,
            Key: fileName,
        }).promise();
        return true;
    } catch(e) {
        return false;
    }
};

const objktIds = [
    111984
];

(async() => {
    for(const objktId of objktIds) {
    const fileExists = await isFileInS3(`${objktId}.png`);
    if(!fileExists) await uploadToS3(`${objktId}.png`);
        // await uploadToS3(`${objktId}.png`);
    }
})();
